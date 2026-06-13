import { TravelerLevelCheckDialog } from "./level-check-dialog.js";

/**
 * A custom RegionBehaviorType that intercepts token movement into a region and
 * handles level transitions with optional prerequisite checks and roll prompts.
 *
 * Registered in CONFIG.RegionBehavior.dataModels as "traveler.changeLevel".
 * The static `events` record is wired in scripts/traveler.js after init fires so
 * that CONST.REGION_EVENTS is guaranteed to be available.
 */
export class TravelerChangeLevelBehavior extends foundry.data.regionBehaviors.RegionBehaviorType {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      mode: new fields.StringField({
        required: true,
        nullable: false,
        initial: "stairs",
        choices: {
          stairs: "Stairs / Ramp (automatic)",
          ladder: "Ladder (interact)",
          cliff: "Cliff Edge (check required)",
          drop: "Drop / Fall",
          "fly-only": "Fly-only Passage"
        },
        label: "Traversal Mode"
      }),
      targetLevelId: new fields.StringField({
        required: false,
        nullable: true,
        initial: null,
        label: "Target Level ID",
        hint: "Scene Level document ID to transition the token to."
      }),
      targetElevation: new fields.NumberField({
        required: false,
        nullable: true,
        initial: null,
        label: "Target Elevation",
        hint: "Exact elevation to set on the token. Takes precedence over Target Level ID."
      }),
      requiredStatusEffect: new fields.StringField({
        required: false,
        nullable: false,
        initial: "",
        label: "Required Status Effect",
        hint: "Status ID the actor must have (e.g. 'flying', 'spider-climb'). Leave blank to skip."
      }),
      requiredItemPattern: new fields.StringField({
        required: false,
        nullable: false,
        initial: "",
        label: "Required Item (regex)",
        hint: "Regex tested against actor item names (e.g. 'rope|climber'). Leave blank to skip."
      }),
      requiresCheck: new fields.BooleanField({
        required: false,
        initial: false,
        label: "Require Roll Check"
      }),
      checkLabel: new fields.StringField({
        required: false,
        nullable: false,
        initial: "Traversal Check",
        label: "Check Label",
        hint: "Displayed in the dialog title and chat messages."
      }),
      checkFormula: new fields.StringField({
        required: false,
        nullable: false,
        initial: "1d20",
        label: "Check Formula",
        hint: "Roll expression; use @ for actor data (e.g. '1d20 + @skills.acr.total')."
      }),
      checkDC: new fields.NumberField({
        required: false,
        nullable: false,
        initial: 10,
        integer: true,
        min: 0,
        label: "DC"
      }),
      failureDamage: new fields.StringField({
        required: false,
        nullable: false,
        initial: "",
        label: "Failure Damage",
        hint: "Dice formula applied on failure (e.g. '2d6'). Leave blank for no damage."
      }),
      allowRetry: new fields.BooleanField({
        required: false,
        initial: false,
        label: "Allow Retry on Failure"
      })
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Resolve the numeric elevation to write to the token after a successful pass.
   * Prefers an explicit `targetElevation`; falls back to the Level document's bottom.
   * @returns {number|null}
   */
  _resolveTargetElevation() {
    if (Number.isFinite(this.targetElevation)) return this.targetElevation;
    if (this.targetLevelId) {
      const level = this.scene?.levels?.get?.(this.targetLevelId);
      if (Number.isFinite(level?.elevation?.bottom)) return level.elevation.bottom;
    }
    return null;
  }

  /**
   * Check whether the actor meets the configured prerequisite conditions.
   * @param {Actor|null} actor
   * @returns {{ met: boolean, reason?: string }}
   */
  _checkPrerequisites(actor) {
    if (!actor) return { met: true };

    const statusId = this.requiredStatusEffect?.trim();
    if (statusId) {
      const hasStatus = actor.statuses?.has?.(statusId);
      if (!hasStatus) {
        return {
          met: false,
          reason: `${actor.name} requires the "${statusId}" status effect to traverse here.`
        };
      }
    }

    const itemPattern = this.requiredItemPattern?.trim();
    if (itemPattern) {
      let regex;
      try {
        regex = new RegExp(itemPattern, "i");
      } catch {
        return { met: false, reason: `Invalid item pattern configured: "${itemPattern}".` };
      }
      const hasItem = actor.items?.some?.((item) => regex.test(item.name));
      if (!hasItem) {
        return {
          met: false,
          reason: `${actor.name} needs an item matching "${itemPattern}" to traverse here.`
        };
      }
    }

    return { met: true };
  }

  /**
   * Write the resolved target elevation to the token document.
   * @param {TokenDocument} tokenDoc
   */
  async _applyElevation(tokenDoc) {
    const elev = this._resolveTargetElevation();
    if (!Number.isFinite(elev)) return;
    try {
      await tokenDoc.update({ elevation: elev }, { animate: false });
    } catch (err) {
      console.warn("Traveler | Failed to update token elevation:", err);
    }
  }

  /**
   * Evaluate the failure damage formula, post it to chat, and apply it to the
   * actor.  Falls back gracefully across game systems.
   * @param {Actor|null} actor
   */
  async _applyFailureDamage(actor) {
    const formula = this.failureDamage?.trim();
    if (!formula || !actor) return;

    let roll;
    try {
      roll = await new Roll(formula).evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${this.checkLabel || "Traversal Check"}: Failure Damage`
      });
    } catch (err) {
      console.warn("Traveler | Failure damage roll failed:", err);
      return;
    }

    const total = roll.total;

    // Try actor.applyDamage — supported by dnd5e and several other systems.
    try {
      if (typeof actor.applyDamage === "function") {
        await actor.applyDamage(total);
        return;
      }
    } catch {}

    // Direct HP update as a cross-system fallback.
    const hpPath = "system.attributes.hp.value";
    const current = foundry.utils.getProperty(actor, hpPath);
    if (Number.isFinite(current)) {
      try {
        await actor.update({ [hpPath]: Math.max(0, current - total) });
        return;
      } catch {}
    }

    ui.notifications.warn(`Traveler | Could not auto-apply damage — apply ${total} to ${actor.name} manually.`);
  }

  // -----------------------------------------------------------------------
  // Core event handler — registered in traveler.js init after CONST is ready
  // -----------------------------------------------------------------------

  /**
   * Handles TOKEN_MOVE_IN:
   *   1. Only acts on the client of the user who initiated the movement.
   *   2. Pauses movement at the region boundary.
   *   3. Checks prerequisites (status effect, item).
   *   4. Optionally shows a roll-check dialog in a retry loop.
   *   5. Either continues movement + sets elevation, or stops the token.
   *
   * @param {RegionEvent} event
   */
  async _handleMoveIn(event) {
    if (!event.user?.isSelf) return;

    const tokenDoc = event.data?.token;
    if (!tokenDoc) return;

    const movementId = event.data?.movement?.id;

    // Use the RegionBehavior's UUID as a stable, unique continuation key.
    const continueKey = this.parent?.uuid ?? foundry.utils.randomID();

    // Pause movement at the region boundary; null means the pause was rejected.
    const paused = tokenDoc.pauseMovement?.(continueKey);
    if (!paused) return;

    const actor = tokenDoc.actor;

    // Gate on prerequisites first — no dialog shown for these.
    const prereq = this._checkPrerequisites(actor);
    if (!prereq.met) {
      tokenDoc.stopMovement?.(movementId);
      ui.notifications.warn(`Traveler | ${prereq.reason}`);
      return;
    }

    // Automatic pass — no roll required.
    if (!this.requiresCheck) {
      tokenDoc.continueMovement?.(movementId, continueKey);
      await this._applyElevation(tokenDoc);
      return;
    }

    // Roll-check loop — movement stays paused across retries.
    let passed = false;
    let runLoop = true;

    while (runLoop) {
      const dialog = new TravelerLevelCheckDialog({ behavior: this, tokenDoc });
      dialog.render({ force: true });
      const result = await dialog.promise;

      if (result.cancelled) {
        runLoop = false;
        break;
      }

      if (result.success) {
        passed = true;
        runLoop = false;
      } else {
        await this._applyFailureDamage(actor);

        if (this.allowRetry) {
          const dialogApi = foundry.applications?.api?.DialogV2 ?? Dialog;
          const doRetry = await dialogApi.confirm({
            title: "Retry?",
            content: `<p>Failed <strong>${this.checkLabel || "check"}</strong> (${result.roll?.total ?? "—"} vs DC ${this.checkDC}). Try again?</p>`
          });
          runLoop = !!doRetry;
        } else {
          runLoop = false;
        }
      }
    }

    if (passed) {
      tokenDoc.continueMovement?.(movementId, continueKey);
      await this._applyElevation(tokenDoc);
    } else {
      tokenDoc.stopMovement?.(movementId);
    }
  }
}

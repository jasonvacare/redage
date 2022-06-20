import { REDAGE } from "../helpers/config.mjs";

/*
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class RedAgeItem extends Item {
  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    // As with the actor class, items are documents that can have their data
    // preparation methods overridden (such as prepareBaseData()).
    super.prepareData();
  }

  /**
   * Prepare a data object which is passed to any Roll formulas which are created related to this Item
   * @private
   */
  getRollData() {
    // If present, return the actor's roll data.
    if ( !this.actor ) return null;
    const rollData = this.actor.getRollData();
    rollData.item = foundry.utils.deepClone(this.data.data);

    return rollData;
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    const item = this.data;
    const actor = this.actor.data;

    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    var label = `[${item.type}] ${item.name}`;

    var formula = null;
    if (item.type === "weapon") {
			return this._onWeaponAttackRoll(item, actor);
    }
    else if (REDAGE.isType(item, ["featureRollable", "featureResourceRollable"])) {
      formula = item.data.formula;
      label = `${item.name}`;
    }
    else if (REDAGE.isType(item, ["featureSkill"])) {
      // if you got here from an item roll, call the method on actor-sheet
      let featMod = (item.data.tier == 1) ? "@skilled" : ((item.data.tier == 2) ? "@expert" : "");
      return this.actor.sheet._onStatRoll(this.name, item.data.defaultStat, item.data.defaultRoll, featMod);
    }
      // else if (item.type === "spellContainer") {
    else if (item.type === "spell") {
      let origin = item.data.origin;
      let items = Array.from(actor.items.values());
      let casterClass = items.find((i) => { return (i.type === 'classCaster' && 
        (i.data.data.spells.primary.name === origin || i.data.data.spells.secondary.name === origin)); });
  
      if (casterClass)
        return this._onSpellCast(item, actor, casterClass);
      else 
        REDAGE.prompt("Unbound Spell", "Spell's origin doesn't match any class's spell type.");

      return;
    }

    // If there's no roll data, send a chat message.
    if (formula == null) {
      ChatMessage.create({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
        content: item.data.description ?? ''
      });
    }
    // Otherwise, create a roll and send a chat message from it.
    else {
      // Retrieve roll data.
      const rollData = this.getRollData();

      // Invoke the roll and submit it to chat.
      const roll = new Roll(formula, rollData);
      roll.toMessage({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
      });
      return roll;
    }
  }

  /**
  * Prep and display weapon attack dialog
  */
  async _onWeaponAttackRoll(item, actor) {

    const rollData = this.getRollData();

    var adShift = 3;
    if (!item.data.isProficient) adShift--;

    var attackStatMod = (item.data.attackStat !== "None") ? "@" + item.data.attackStat.toLowerCase() + ".mod + " : "";
    var damageStatMod = (item.data.damageStat !== "None") ? "@" + item.data.damageStat.toLowerCase() + ".mod + " : "";

    var attackFormula = "@attackBonus + " + attackStatMod + "@item.attackBonus ";
    var damageFormula = "+ " + damageStatMod + "@item.damageBonus ";

    // fighter feature check
    if (actor.data.fighterMastery) {
      if (actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()]) {
        let m = actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()];
        if (m.damage) damageFormula += "+ @fighterMastery.damage ";
      }
    }

    // TODO to add
    // 		fighter-type bonuses from other sources (brute, acrobatic combatant, etc)
    //		sneak attack

    const attackRoll = new Roll(attackFormula, rollData);
    await attackRoll.evaluate({async: true});
    const damageRoll = new Roll(damageFormula, rollData);
    await damageRoll.evaluate({async: true});

    damageFormula = "@item.damageDie " + damageFormula;

    const dialogData = {
      actor: actor,
      item: item,
      attackFormula: attackFormula,
      attackRoll: attackRoll,
      damageFormula: damageFormula,
      damageRoll: damageRoll,
      adShift: adShift,
      adLadder: ["+3D", "+2D", "+D", "A / D", "+A", "+2A", "+3A"],
      rollData: rollData
    };

    const template = "systems/redage/templates/dialogs/roll-weapon-attack.html";
    const html = await renderTemplate(template, dialogData);

    // this.tempData is a temporary place to store data for inter-function transport
    // the dialog callback only passes its own html as text, so we need a way to move data
    // it can be overwritten as needed
    this.tempData = dialogData;

    const _doRoll = async (html) => { return this._doWeaponAttackRoll(html, this.tempData); };

    this.popUpDialog = new Dialog({
      title: actor.name + " - " + item.name + " Attack",
      content: html,
      default: "roll",
      buttons: {
        roll: {
          label: "Attack",
          callback: (html) => _doRoll(html),
        },
        cancel: {
          label: "Cancel",
          callback: () => { ; },
        }
      },
    });

    this.popUpDialog.position.width = 500;

    const s = this.popUpDialog.render(true);

    if (s instanceof Promise)
      await s;

    return this.tempData.chatMessage;
  }

  /**
  * Actual processing and output of weapon attack roll
  */
  async _doWeaponAttackRoll(html, dialogData) {

    const actor = dialogData.actor;
    const item = dialogData.item;

    dialogData.attackNotes = [];

    // get data from dialog
    const form = html[0].querySelector("form");
    const adShift = REDAGE.getDialogField(form, "adShift", true) - 3;
    let attackModifierFormula = REDAGE.getDialogField(form, "attackModifierFormula");
    let damageModifierFormula = REDAGE.getDialogField(form, "damageModifierFormula");
    const targets = Math.max(1, REDAGE.getDialogField(form, "targets", true));
    const targetStat = REDAGE.getDialogField(form, "targetStat");

    let baseAttackFormula = dialogData.attackFormula;
    dialogData.attackFormula = dialogData.attackFormula + ((attackModifierFormula.trim()) ? "+" + attackModifierFormula.trim() : "");
    if (!Roll.validate(dialogData.attackFormula)) {
      REDAGE.prompt("Invalid Attack Formula", "Invalid: " + dialogData.attackFormula);
      return;
    }
    let dice = REDAGE.getD20(actor, adShift);
    dialogData.attackFormula = dice + " + " + dialogData.attackFormula;

    const adShiftLadder = ["+3D", "+2D", "+D", "", "+A", "+2A", "+3A"];
    if (adShift != 0) dialogData.attackNotes.push(adShiftLadder[adShift+3]);
    if (targetStat !== "Defense") dialogData.attackNotes.push("vs " + targetStat);

    dialogData.damageFormula = dialogData.damageFormula + ((damageModifierFormula.trim()) ? "+" + damageModifierFormula.trim() : "");
    if (!Roll.validate(dialogData.damageFormula)) {
      REDAGE.prompt("Invalid Damage Formula", "Invalid: " + dialogData.damageFormula);
      return;
    }

    let brutal = false;
    let damage = false;
    let flurry = false;
    let cleave = false;
    let specials = { Crit: [20, 1000], Fumble: [-1000, 1] };
    // apply fighter mastery benefits
    if (actor.data.fighterMastery) {
      specials.Deed = [actor.data.fighterMastery.deedsNumber];

      if (actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()]) {
        let m = actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()];
        brutal = m.brutal;
        damage = m.damage;
        flurry = m.supremacy;
        cleave = m.cleave;
        if (brutal && actor.data.fighterMastery.fighterLevel >= 5) specials.Crit[0] = 19;
      }
    }

    // apply flurry penalty (equivalent to dividing attack bonus among multiple targets, rounded normally)
    if (targets > 1) {
      let roll = new Roll(baseAttackFormula, dialogData.rollData);
      await roll.evaluate({async: true});
      dialogData.rollData.flurryPenalty = roll.total - Math.round(roll.total / targets);
      dialogData.attackFormula += " - @flurryPenalty ";
      dialogData.attackNotes.push("Flurry " + targets);
    }

    if (cleave) dialogData.attackNotes.push("Cleave");

    dialogData.attacks = await REDAGE.d20Roll(dialogData.attackFormula, targets, dialogData.rollData, specials);
    if (dialogData.attacks.length <= 0) {
      REDAGE.prompt("Attack Handling Failed", "No attacks were processed.");
      return;
    }

    for (let a=0; a < dialogData.attacks.length; a++) {
      let notes = [item.data.damageType];
      let formula = dialogData.damageFormula;

      // handle crit damage
      if (dialogData.attacks[a].notes.includes("Crit")) {

        let roll = new Roll(formula, dialogData.rollData);
        const damageDie = roll.terms[0];
        const damageDieMax = Number(damageDie.number) * Number(damageDie.faces);
        dialogData.rollData.critBonus = damageDieMax;
        formula += " + @critBonus "
  
        if (brutal) {
          dialogData.rollData.brutalBonus = damageDieMax;
          formula += " + @brutalBonus ";
          dialogData.attacks[a].notes = dialogData.attacks[a].notes.replace("Crit", "Brutal Crit");
        }
      }

      let roll = new Roll(formula, dialogData.rollData);
      await roll.evaluate({async: true});
  
      notes = (notes.length > 0) ? "(" + notes.join(", ") + ")" : "";
      dialogData.attacks[a].damage = { notes: notes, roll: roll, rollRender: await roll.render(), formula: formula };
    }

    const rollMode = game.settings.get("core", "rollMode");

    const rollArray = dialogData.attacks.map((x) => {
      return [x.roll, x.damage.roll];
    }).flat();
    const diceData = Roll.fromTerms([
      PoolTerm.fromRolls(rollArray),
    ]);

    dialogData.attackNotes = (dialogData.attackNotes.length > 0) ? "(" + dialogData.attackNotes.join(", ") + ")" : "";

    const template = "systems/redage/templates/chat/weapon-attack-roll.html";
    const chatContent = await renderTemplate(template, dialogData);
    const chatMessage = getDocumentClass("ChatMessage");
    chatMessage.create(
      chatMessage.applyRollMode(
      {
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        roll: JSON.stringify(diceData),
        content: chatContent,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
      },
      rollMode
      )
    );

    this.tempData.chatMessage = chatMessage;
    return chatMessage;
  }

  /**
	* Prep and display spell casting dialog
	*/
  async _onSpellCast(item, actor, casterClass) {

		const rollData = this.getRollData();

    // TODO apply warning color to mana when your selected power costs more mana than you have

    let power = item.data.powerMin;

    rollData.spell = { hasEffect: item.data.effect.hasRoll, effectBonus: item.data.effectBonus, 
      hasMagnitude: item.data.magnitude.hasRoll, magnitudeBonus: item.data.magnitudeBonus };

    let stat = casterClass.data.data.castingStat.toLowerCase();
    rollData.stat = actor.data[stat];

    rollData.casterLevel = casterClass.data.data.classLevel;
    rollData.casterMaxPower = casterClass.data.data.maxPower;
    rollData.panoply = casterClass.data.data.panoply.count;

    let adShift = 3;

    let effectFormula = "@casterMaxPower + @" + stat + ".mod"; // + @spell.effectBonus
    let effectRoll = new Roll(effectFormula, rollData);
    effectRoll.evaluate({async: false});
    let targets = 1;

    let magnitudeFormula = item.data.magnitude.formula; // + @spell.magnitudeBonus
    let magnitudeType = item.data.magnitude.type;
    // let magnitudeRoll = new Roll(magnitudeFormula, rollData);

    const dialogData = {
      actor: actor,
      item: item,      
      casterClass: casterClass,
      spell: rollData.spell,

      power: power,
      hasEffectRoll: item.data.effect.hasRoll,
      effectFormula: effectFormula,
      effectRoll: effectRoll,
      adShift: adShift,
      adLadder: ["+3D", "+2D", "+D", "A / D", "+A", "+2A", "+3A"],
      targets: targets,
      targetStat: item.data.effect.targetStat,

      hasMagnitudeRoll: item.data.magnitude.hasRoll,
      magnitudeFormula: magnitudeFormula,
      magnitudeType: magnitudeType,

      rollData: rollData,
      castingTooltipColor: ((rollData.casterMaxPower > rollData.panoply) ? "red" : "")
    };

    const template = "systems/redage/templates/dialogs/roll-spell-cast.html";
    const html = await renderTemplate(template, dialogData);

    // this.tempData is a temporary place to store data for inter-function transport
    // the dialog callback only passes its own html as text, so we need a way to move data
    // it can be overwritten as needed
    this.tempData = dialogData;

    const _doRoll = async (html) => { return this._doSpellCast(html, this.tempData); };

    this.popUpDialog = new Dialog({
      title: actor.name + " - " + item.name,
      content: html,
      default: "roll",
      buttons: {
        roll: { label: "Cast", callback: (html) => _doRoll(html) },
        cancel: { label: "Cancel", callback: () => { ; } }
      },
    });

    this.popUpDialog.position.width = 470;

    const s = this.popUpDialog.render(true);

    if (s instanceof Promise)
      await s;

    return this.tempData.chatMessage;
  }

  /**
  * Actual processing and output of spell casting
  */
  async _doSpellCast(html, dialogData) {

    const actor = dialogData.actor;
    const item = dialogData.item;
    const casterClass = dialogData.casterClass;
    const rollData = dialogData.rollData;
    const spell = dialogData.spell;

    // get data from dialog
    const form = html[0].querySelector("form");
    const adShift = REDAGE.getDialogField(form, "adShift", true) - 3;
    const power = REDAGE.getDialogField(form, "power", true);
    const manaCost = (power > 0) ? Math.floor(1 + ((4/3) * power)) : 0;
    const targetStat = REDAGE.getDialogField(form, "targetStat");
    const targets = REDAGE.getDialogField(form, "targets", true);
    const magnitudeFormula = REDAGE.getDialogField(form, "magnitudeFormula");

    dialogData.power = power;
    rollData.power = power;
    dialogData.manaCost = manaCost;
    dialogData.magnitudeFormula = magnitudeFormula;

    // general casting notes
    dialogData.castNotes = ["Power " + power, (manaCost > 0) ? (manaCost + " mana") : "1 cantrip"];

    const adShiftLadder = ["+3D", "+2D", "+D", "", "+A", "+2A", "+3A"];
    const adShiftNote = adShiftLadder[adShift+3];
    if (adShiftNote)
      dialogData.castNotes.push(adShiftNote);
    if (targetStat)
      dialogData.castNotes.push("vs " + targetStat);

    // decrement mana
    if (manaCost == 0) {
      if (actor.data.mana.cantrip <= 0) {
        REDAGE.prompt("Cantrip Failed", "Insufficient cantrips (consider refreshing with mana)");
        return;
      }
      this.actor.update( { "data.mana.cantrip": actor.data.mana.cantrip - 1 }, {});
    }
    else {
      if (actor.data.mana.value < manaCost) {
        REDAGE.prompt("Spell Failed", "Insufficient mana (consider Overdrawing)");
        return;
      }
      this.actor.update( { "data.mana.value": (actor.data.mana.value - manaCost) }, {});
    }

    // if the spell requires effect rolls, handle for each target
    dialogData.effects = [];

    if (spell.hasEffect && !isNaN(targets) && targets > 0)
    {
      // handle advantage / disadvantage on effect roll
      let dice = REDAGE.getD20(actor, adShift);
      dialogData.effectFormula = dice + " + " + dialogData.effectFormula;
      dialogData.effects = await REDAGE.d20Roll(dialogData.effectFormula, targets, dialogData.rollData);
    }

    // if there is a magnitude formula...
    if (spell.hasMagnitude && magnitudeFormula)
    {
      let notes = [];
      if (dialogData.magnitudeType)
        notes = [dialogData.magnitudeType];
      const magRoll = new Roll(dialogData.magnitudeFormula, dialogData.rollData);
      await magRoll.evaluate({async: true});
      const rollRender = await magRoll.render();

      notes = (notes.length > 0) ? "(" + notes.join(", ") + ")" : "";

      dialogData.magnitude = { notes: notes, roll: magRoll, rollRender: rollRender };
    }

    const rollMode = game.settings.get("core", "rollMode");

    const rollArray = dialogData.effects.map((x) => x.roll);
    if (magnitudeFormula)
      rollArray.push(dialogData.magnitude.roll);
    const diceData = Roll.fromTerms([
      PoolTerm.fromRolls(rollArray),
    ]);

    dialogData.castNotes = (dialogData.castNotes.length > 0) ? "(" + dialogData.castNotes.join(", ") + ")" : "";

    const template = "systems/redage/templates/chat/spell-cast-roll.html";
    const chatContent = await renderTemplate(template, dialogData);
    const chatMessage = getDocumentClass("ChatMessage");
    chatMessage.create(
      chatMessage.applyRollMode(
      {
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        roll: JSON.stringify(diceData),
        content: chatContent,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
      },
      rollMode
      )
    );

    this.tempData.chatMessage = chatMessage;
    return chatMessage;
  }
}
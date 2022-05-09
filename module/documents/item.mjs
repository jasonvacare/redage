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

		var attackFormula = "@attackBonus";
		var damageFormula = "@item.damageDie";

		if (item.data.isForceful && item.data.isFinesse) {
			attackFormula += (actor.data.vigor.mod > actor.data.dexterity.mod) ? "+@vigor.mod" : "+@dexterity.mod";
			damageFormula += (actor.data.vigor.mod > actor.data.dexterity.mod) ? "+@vigor.mod" : "+@dexterity.mod";
		}
		else if (item.data.isForceful) {
			attackFormula += "+@vigor.mod";
			damageFormula += "+@vigor.mod";
		}
		else if (item.data.isFinesse) {
			attackFormula += "+@dexterity.mod";
			damageFormula += "+@dexterity.mod";
		}

		attackFormula += "+@item.attackBonus";
		damageFormula += "+@item.damageBonus";

		// fighter feature check
		if (actor.data.fighterMastery) {
      if (actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()]) {
        let m = actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()];
        if (m.damage) damageFormula += "+@fighterMastery.damage";
      }
		}

		// TODO to add
		// 		fighter-type bonuses from other sources (brute, acrobatic combatant, etc)
		//		sneak attack

		const attackRoll = new Roll(attackFormula, rollData);
		const damageRoll = new Roll(damageFormula, rollData);

		const dialogData = {
			actor: actor,
			item: item,
			attackFormula: attackFormula,
			attackRoll: attackRoll,
			damageFormula: damageFormula,
			damageRoll: damageRoll,
			adShift: adShift,
			adLadder: ["+3D", "+2D", "+D", "Normal", "+A", "+2A", "+3A"],
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
			title: actor.name + " - " + item.name + "Attack",
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
		dialogData.damageNotes = [item.data.damageType];

		// get data from dialog
		var _a;
		const form = html[0].querySelector("form");
		const adShift = parseInt((_a = form.querySelector('[name="adShift"]')) === null || _a === void 0 ? void 0 : _a.value) - 3;

    // handle advantage / disadvantage on attack roll
    let dice = REDAGE.getD20(actor, adShift);
    dialogData.attackFormula = dice + " + " + dialogData.attackFormula;
    const adShiftLadder = ["+3D", "+2D", "+D", "", "+A", "+2A", "+3A"];
    if (adShift != 0) dialogData.attackNotes.push(adShiftLadder[adShift+3]);

		// handle attack roll
		const attackRoll = new Roll(dialogData.attackFormula, dialogData.rollData);
		await attackRoll.evaluate({async: true});

		// handle special attack rolls (crit, fumble, deeds)
		const attackD20Result = attackRoll.terms[0].total;
		var critThreshold = 20;
		var fumbleThreshold = 1;
		var deedsNumber = 0;

    // apply fighter brutal crit threat range and deeds number
    if (actor.data.fighterMastery) {
      deedsNumber = actor.data.fighterMastery.deedsNumber;

      if (actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()]) {
        let m = actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()];
        if (m.brutal && actor.data.fighterMastery.fighterLevel >= 5) critThreshold = 19;
      }
    }

		if (attackD20Result >= critThreshold)
		{
			dialogData.attackNotes.push("Crit");

			// add maximized damage die
			const damageDie = dialogData.damageRoll.terms[0];
			const damageDieMax = Number(damageDie.number) * Number(damageDie.faces);
			dialogData.damageFormula += " + " + damageDieMax;

      // apply fighter brutal crit damage
      if (actor.data.fighterMastery) {
        if (actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()]) {
          let m = actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()];
  				if (m.brutal) dialogData.damageFormula += " + " + damageDieMax;
        }
			}
		}
		else if (attackD20Result <= fumbleThreshold)
		{
			dialogData.attackNotes.push("Fumble");
		}

		// deeds number may overlap with crit / fumble
		if (attackD20Result == deedsNumber)
		{
			dialogData.attackNotes.push("Mighty Deeds");
		}

		const damageRoll = new Roll(dialogData.damageFormula, dialogData.rollData);
		await damageRoll.evaluate({async: true});

		const rollMode = game.settings.get("core", "rollMode");
		const diceData = Roll.fromTerms([
			PoolTerm.fromRolls([attackRoll, damageRoll]),
		]);

		const diceTooltip = {
			attack: await attackRoll.render(),
			damage: await damageRoll.render(),
		};

		dialogData.attackRoll = attackRoll;
		dialogData.damageRoll = damageRoll;
		dialogData.diceTooltip = diceTooltip;

		dialogData.attackNotes = (dialogData.attackNotes.length > 0) ? "(" + dialogData.attackNotes.join(", ") + ")" : "";
		dialogData.damageNotes = (dialogData.damageNotes.length > 0) ? "(" + dialogData.damageNotes.join(", ") + ")" : "";

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
    var _a;
    const form = html[0].querySelector("form");

    const adShift = parseInt((_a = form.querySelector('[name="adShift"]')) === null || _a === void 0 ? void 0 : _a.value) - 3;
    const power = parseInt((_a = form.querySelector('[name="power"]')) === null || _a === void 0 ? void 0 : _a.value);
    const manaCost = (power > 0) ? Math.floor(1 + ((4/3) * power)) : 0;
    const targetStat = (_a = form.querySelector('[name="targetStat"]')) === null || _a === void 0 ? void 0 : _a.value;
    const targets = parseInt((_a = form.querySelector('[name="targets"]')) === null || _a === void 0 ? void 0 : _a.value);
    const magnitudeFormula = (_a = form.querySelector('[name="magnitudeFormula"]')) === null || _a === void 0 ? void 0 : _a.value;

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
      this.actor.data.update({ "data.mana.cantrip": actor.data.mana.cantrip - 1 }, {});  
    }
    else {
      if (actor.data.mana.value < manaCost) {
        REDAGE.prompt("Spell Failed", "Insufficient mana (consider Overdrawing)");
        return;
      }
      this.actor.data.update({ "data.mana.value": (actor.data.mana.value - manaCost) }, {});
    }

    // TODO the readings on the character sheet spell tab aren't updating when decremented
    //???
    //this.actor._sheet.render(false, {});






    // if the spell requires effect rolls, handle for each target
    dialogData.effects = [];

    if (spell.hasEffect && !isNaN(targets) && targets > 0)
    {

      // handle advantage / disadvantage on effect roll
      let dice = REDAGE.getD20(actor, adShift);
      dialogData.effectFormula = dice + " + " + dialogData.effectFormula;

      for (let e=0; e < targets; e++)
      {
        let notes = [];

        // handle effect roll
        const effectRoll = new Roll(dialogData.effectFormula, dialogData.rollData);
        await effectRoll.evaluate({async: true});

        // handle special effect rolls (crit, fumble)
        const effectD20Result = effectRoll.terms[0].total;
        let critThreshold = 20;
        let fumbleThreshold = 1;

        if (effectD20Result >= critThreshold)
        {
          notes.push("Crit");
        }
        else if (effectD20Result <= fumbleThreshold)
        {
          notes.push("Fumble");
        }

        notes = (notes.length > 0) ? "(" + notes.join(", ") + ")" : "";
        const rollRender = await effectRoll.render();
  
        dialogData.effects[e] = { notes: notes, roll: effectRoll, id: (e+1), rollRender: rollRender };
      }
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
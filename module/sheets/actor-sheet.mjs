import {onManageActiveEffect, prepareActiveEffectCategories} from "../helpers/effects.mjs";
import { REDAGE } from "/systems/redage/module/helpers/config.mjs";
/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class RedAgeActorSheet extends ActorSheet {

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["redage", "sheet", "actor"],
      template: "systems/redage/templates/actor/actor-sheet.html",
      width: 600,
      height: 700,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "features" }],
      dragDrop: [{ dragSelector: ".items-list .item", dropSelector: null }]
    });
  }

  /** @override */
  get template() {
    return `systems/redage/templates/actor/actor-${this.actor.data.type}-sheet.html`;
  }

  /* -------------------------------------------- */

  /** @override */
  getData() {
    // Retrieve the data structure from the base sheet. You can inspect or log
    // the context variable to see the structure, but some key properties for
    // sheets are the actor object, the data object, whether or not it's
    // editable, the items array, and the effects array.
    const context = super.getData();

    // Use a safe clone of the actor data for further operations.
    const actorData = context.actor.data;    

    // Add the actor's data to context.data for easier access, as well as flags.
    context.data = actorData.data;
    context.flags = actorData.flags;

    // Prepare character data and items.
    if (actorData.type == 'character') {
      this._prepareItems(context);
      this._prepareCharacterData(context);
    }

    // Prepare NPC data and items.
    if (actorData.type == 'npc') {
      this._prepareItems(context);
    }

    // Add roll data for TinyMCE editors.
    context.rollData = context.actor.getRollData();

    // Prepare active effects
    context.effects = prepareActiveEffectCategories(this.actor.effects);

    return context;
  }

  /*
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} actorData The actor to prepare.
   *
   * @return {undefined}
   */
  _prepareCharacterData(context) {
    context.data.classLevels = this._calculateClassLevels(context.items);

    // Highlight load level and supply tooltip
    switch (context.data.carried.loadLevel)
    {
    case REDAGE.LOAD_LIGHT: context.data.carried.color = "blue";
      context.data.carried.tooltip = "";
      break;
    case REDAGE.LOAD_MEDIUM: context.data.carried.color = "green";
      context.data.carried.tooltip = "+D to swimming, climbing, jumping, and acrobatics";
      break;
    case REDAGE.LOAD_HEAVY: context.data.carried.color = "yellow";
      context.data.carried.tooltip = "+D to Dex and Vigor stat, save, attack, and effect checks\n+D to initiative\nSlowed\nCan't swim";
      break;
    default: context.data.carried.color = "red";
      context.data.carried.tooltip = "+D to Dex and Vigor stat, save, attack, and effect checks\n+D to initiative\nSlowed 6x\nCan't swim\nFatigue every 10 min";
      break;
    }

    // Highlight if too many items are readied
    context.data.readied.color = (context.data.readied.value > context.data.readied.max) ? "red" : "";

    context.data.health.tooltip = "Reserve: " + context.data.health.reserve;
    if (context.data.health.temp > 0)
      context.data.health.tooltip += "\nTemp: " + context.data.health.temp;

    // TODO visual indicator showing that your dex / mod have been capped down by armor (color, small icon)?
    // tooltip of the elements summed into your defense, including clumsy penalty
    // all stats show green / red color and icon to indicate alteration from base

    // Determine feat points available and used (basic and class subtypes), highlight if overspent
    context.data.featPoints = { tooltip: ""};
    var fpSpent = this._calculateFeatPoints(context.items);
		var fp = { value: fpSpent.basic.spent };
    context.data.featPoints.basic = fp;
    let mundaneFP = Math.floor(Math.min(context.data.characterLevel, REDAGE.HeroicLevelThreshold) / 2);
    let heroicFP = (context.data.characterLevel - REDAGE.HeroicLevelThreshold > 0) ? context.data.characterLevel - REDAGE.HeroicLevelThreshold : 0;
 		fp.max = 2 + context.data.wits.mod + mundaneFP + heroicFP;
    let overspent = (fp.value > fp.max);

    context.data.featPoints.report = [ "General (" + fp.value + " / " + fp.max + ")" ];

    context.data.featPoints.rogue = fp = { value: fpSpent.rogue.spent, max: fpSpent.rogue.max };
    overspent = overspent || (fp.value > fp.max);
    if (fp.max > 0)
      context.data.featPoints.report.push("Rogue (" + fp.value + " / " + fp.max + ")");

    context.data.featPoints.mutation = fp = { value: fpSpent.mutation.spent, max: fpSpent.mutation.max };
    overspent = overspent || (fp.value > fp.max);
    if (fp.max > 0) context.data.featPoints.report.push("Mutation (" + fp.value + " / " + fp.max + ")");

    context.data.featPoints.skulk = fp = { value: fpSpent.skulk.spent, max: fpSpent.skulk.max };
    overspent = overspent || (fp.value > fp.max);
    if (fp.max > 0) context.data.featPoints.report.push("Skulk (" + fp.value + " / " + fp.max + ")");

    context.data.featPoints.report = context.data.featPoints.report.join(", ");
    if (overspent) context.data.featPoints.basic.color = "red";

    // Determine spells available and used (by type), highlight if overspent
    let casters = context.items.filter((item) => { return item.type === "classCaster"; });
    let spells = context.items.filter((item) => { return item.type === "spell" && 
      (item.data.location === REDAGE.SPELL_PREPARED || item.data.location === REDAGE.SPELL_INNATE); });
    let unknownSpells = spells.length;

    overspent = false;
    context.data.spellPrep = { text: [] };

    for (let c of casters) {
      context.data.level = c.data.classLevel;
      let primary = c.data.spells.primary;
      let secondary = c.data.spells.secondary;
      primary.value = 0;
      secondary.value = 0;

      primary.max = 0;
      if (Roll.validate(primary.formula)) {
        let val = new Roll(primary.formula, context.data);
        val.evaluate({async: false});
        primary.max = val.total;
      }
  
      secondary.max = 0;
      if (Roll.validate(secondary.formula)) {
        let val = new Roll(secondary.formula, context.data);
        val.evaluate({async: false});
        secondary.max = val.total;
      }

      for (let s of spells) {
        let data = s.data;
        if (primary.name !== "" && data.origin === primary.name) { unknownSpells--; primary.value += data.size; }
        if (secondary.name !== "" && data.origin === secondary.name) { unknownSpells--; secondary.value += data.size; }
      }

      if (primary.name !== "" && primary.max > 0) {
        context.data.spellPrep.text.push(primary.name + " (" + primary.value + " / " + primary.max + ")");
        overspent = overspent || (primary.value > primary.max);
      }
      if (secondary.name !== "" && secondary.max > 0) {
        context.data.spellPrep.text.push(secondary.name + " (" + secondary.value + " / " + secondary.max + ")");
        overspent = overspent || (secondary.value > secondary.max);
      }
    }

    if (unknownSpells > 0)
      context.data.spellPrep.text.push("Other (" + unknownSpells + ")");

    context.data.spellPrep.text = context.data.spellPrep.text.join(", ");
    if (overspent) context.data.spellPrep.color = "red";
  }

  /*
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} actorData The actor to prepare.
   *
   * @return {undefined}
   */
  _prepareItems(context) {
    // Initialize containers.
    const gear = [];
    const gearByLoc = {
    	Inventory: [],
    	Camp: [],
    	Town: []
    };

    const features = [];

    const spells = [];
    const spellsByLoc = {
    	Inventory: [],
    	Camp: [],
    	Town: []
    };

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || DEFAULT_TOKEN;

      // Append to gear
      if (i.data.group === "item")
      {
        i.data.locations = REDAGE.ItemLocations;
        gear.push(i);
        if (i.data.location == REDAGE.INV_CAMP)
        	gearByLoc.Camp.push(i);
        else if (i.data.location == REDAGE.INV_TOWN)
        	gearByLoc.Town.push(i);
        else
        	gearByLoc.Inventory.push(i);
      }

      // Append to features
      else if (i.data.group === "feat")
      {
        features.push(i);
      }

      // Append to spells
      else if (i.data.group === "magic")
      {
        i.data.spellLocations = REDAGE.SpellLocations;
        spells.push(i);
        if (i.data.location == REDAGE.SPELL_CAMP)
        	spellsByLoc.Camp.push(i);
        else if (i.data.location == REDAGE.SPELL_TOWN)
        	spellsByLoc.Town.push(i);
        else
        	spellsByLoc.Inventory.push(i);
      }
    }

		// sort gear by location
    gearByLoc.Inventory.sort((first, second) => {
   		let one = REDAGE.ordinal(first.data.location, REDAGE.ItemLocations);
   		let two = REDAGE.ordinal(second.data.location, REDAGE.ItemLocations);
   		return one - two;
    });

		// sort spells by location
    spellsByLoc.Inventory.sort((first, second) => {
      let one = REDAGE.ordinal(first.data.location, REDAGE.SpellLocations);
      let two = REDAGE.ordinal(second.data.location, REDAGE.SpellLocations);
      return one - two;
   });

    // Assign and return
    context.gear = gear;
    context.gearByLoc = gearByLoc;
    context.features = features;
    context.spells = spells;
    context.spellsByLoc = spellsByLoc;
   }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Render the item sheet for viewing/editing prior to the editable check.
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Add Inventory Item
    html.find('.item-create').click(this._onItemCreate.bind(this));

    // Delete Inventory Item
    html.find('.item-delete').click(this._onItemDelete.bind(this));

    // Active Effect management
    html.find(".effect-control").click(ev => onManageActiveEffect(ev, this.actor));

    // Rollable abilities.
    html.find('.rollable').click(this._onRoll.bind(this));

    // Incrementable / Decrementable quantities
    html.find('.item-inc').click(ev => { this._incdec(ev, 1); });
    html.find('.item-dec').click(ev => { this._incdec(ev, -1); });

    // Relocate item in inventory
    html.find(".item-relocate").on("change", ev => {
	    ev.preventDefault();
      ev.stopPropagation();
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.data.data.location = ev.currentTarget.value;
			item.update({ "data.location": item.data.data.location }, {});
    });

    // Drag events for macros.
    if (this.actor.owner) {
      let handler = ev => this._onDragStart(ev);
      html.find('li.item').each((i, li) => {
        if (li.classList.contains("inventory-header")) return;
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", handler, false);
      });
    }
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;
    // Grab any data associated with this control.
    const data = duplicate(header.dataset);
    // Initialize a default name.
    const name = `New ${type.capitalize()}`;
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      data: data
    };
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.data["type"];

    // Finally, create the item!
    return await Item.create(itemData, {parent: this.actor});
  }

  /**
   * Handle deleting a new Owned Item for the actor
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemDelete(event) {
    event.preventDefault();
    const li = $(event.currentTarget).parents(".item");
    const item = this.actor.items.get(li.data("itemId"));

    if (!item)
      return;

    const performDelete = await new Promise((resolve) => {
      Dialog.confirm({
        title: "Delete",
        yes: () => resolve(true),
        no: () => resolve(false),
        content: game.i18n.format("Delete {name}?", {
          name: item.name,
          actor: this.actor.name,
        }),
      });
    });
    if (!performDelete)
      return;

    item.delete();
    li.slideUp(200, () => this.render(false));
  }

  async _onDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    }
    catch (err) {
      return false;
    }

    const actor = this.actor;

    // Handle the drop with a Hooked function
    const allowed = Hooks.call("dropActorSheetData", actor, this, data);
    if (allowed === false) return;

    switch (data.type) {
      case "ActiveEffect": return this._onDropActiveEffect(event, data);
      case "Actor": return this._onDropActor(event, data);
      case "Item": return this._onDropItem(event, data);
    }
  }

  // DOES NOTHING RIGHT NOW
  async _onDropActor(event, data) {
    if (!this.actor.isOwner) return false;
  }

  // DOES NOTHING RIGHT NOW
  async _onDropActiveEffect(event, data) {
    if (!this.actor.isOwner) return false;
  }

  // sorts item if dropped into own inventory, or creates it if transfered to another character
  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;

    const item = await Item.implementation.fromDropData(data);
    const itemData = item.toObject();

    // Handle item sorting within the same actor
    const actor = this.actor;
    let sameActor = (data.actorId === actor.id) || (actor.isToken && (data.tokenId === actor.token.id));
    if (sameActor) return this._onSortItem(event, itemData);

    // Else, create the owned item
    return this._onDropItemCreate(itemData);
  }

  _onSortItem(event, itemData) {
    // Get the drag source and its siblings
    const source = this.actor.items.get(itemData._id);

    // get all items of the same group type
    const siblings = this.actor.items.filter(i => {
      return (i.data.data.group === itemData.data.group && (i.data._id != source.data._id));
    });

    // Get the drop target
    const dropTarget = event.target.closest("[data-item-id]");
    const targetId = dropTarget ? dropTarget.dataset.itemId : null;
    const target = siblings.find(s => s.data._id === targetId);

    // Ensure we're only sorting like group types
    if (target && (source.data.data.group !== target.data.data.group)) return;

    // Perform the sort
    const sortUpdates = SortingHelpers.performIntegerSort(source, { target: target, siblings });
    const updateData = sortUpdates.map(u => {
      const update = u.update;
      update._id = u.target.data._id;
      return update;
    });

    // Perform the update
    return this.actor.updateEmbeddedDocuments("Item", updateData);
  }

  _incdec(ev, delta) {
    ev.preventDefault();
    ev.stopPropagation();
    const li = $(ev.currentTarget).parents(".item");
    const item = this.actor.items.get(li.data("itemId"));
    var entry;
    var quantityName;
    if (item.data.data.group === "item") {
      entry = item.data.data.quantity;
      quantityName = "data.quantity.value";
    }
    else if (item.data.data.group === "feat") {
      entry = item.data.data.resource;
      quantityName = "data.resource.value";
    }

    entry.value = entry.value + delta;
    if (entry.max != null)
      entry.value = Math.min(entry.max, entry.value);
    if (entry.min != null)
    entry.value = Math.max(entry.min, entry.value);

    const val = { };
    val[quantityName] = entry.value;
    item.update(val, {});
  }


  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    if (dataset.rollType)
    {
      // Handle item rolls.
      if (dataset.rollType == 'item') {
        const itemId = element.closest('.item').dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) {
          if (item.type === "featureSkill")
          {
            let featMod = (item.data.data.tier == 1) ? "@skilled" : ((item.data.data.tier == 2) ? "@expert" : "");
            this._onStatRoll(item.name, item.data.data.defaultStat, item.data.data.defaultRoll, featMod);
          }
          else
            return item.roll();
        }
      }
      // Handle stat rolls
      else if (dataset.rollType == 'stat') {
        let rollType = dataset.label.split(' ');
        this._onStatRoll("Stat Roll", rollType[0], rollType[1], "");
      }
      // Handle defense rolls
      else if (dataset.rollType == 'defense') {
        this._onStatRoll("Defense", "defenseBonus", "Save", "");
      }
      // HP / reserve/ tHP / Life manager dialog
      else if (dataset.rollType == 'healthManager') {
        this._onHealthManager();
      }
    }
    
    // Handle rolls that supply the formula directly.
    if (dataset.roll) {      
      let label = dataset.label ? `${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }
  }


  // Helper Functions

  _calculateClassLevels(items) {   
    let classes = items.filter((item) => { return REDAGE.isType(item, ["class", "classCaster", "classFighter"]); });
    if (classes.length === 0) return 0;
    let classLevels = classes.map(c => c.data.classLevel).reduce((a, b) => a + b);
    return classLevels;
  }

  _calculateFeatPoints(items) {
    let featPointsSpent = { basic: {spent: 0, max: 0}, rogue: {spent: 0, max: 0}, mutation: {spent: 0, max: 0}, skulk: {spent: 0, max: 0} };

    var abhumanLevels = 0;
    for (let i of items) {
      if (REDAGE.isType(i, ["class", "classCaster", "classFighter"])) {
        if (i.name.toLowerCase() === "rogue")
          featPointsSpent.rogue.max = Math.min(15, i.data.classLevel + 5);
        else if (i.name.toLowerCase().includes("brute") || i.name.toLowerCase().includes("malison"))
          abhumanLevels += i.data.classLevel;
        else if (i.name.toLowerCase().includes("skulk"))
        {
          abhumanLevels += i.data.classLevel;
          featPointsSpent.skulk.max = Math.min(8, Math.floor(i.data.classLevel / 2) + 3);
        }
      }
      else if (i.data.group === "feat") {
        if (i.data.origin.toLowerCase() === "rogue")
          featPointsSpent.rogue.spent += i.data.cost;
        else if (i.data.origin.toLowerCase() === "skulk")
          featPointsSpent.skulk.spent += i.data.cost;
        else if (i.data.origin.toLowerCase() === "mutation")
          featPointsSpent.mutation.spent += i.data.cost;
        else
      	  featPointsSpent.basic.spent += i.data.cost;
      }
    }
    if (abhumanLevels > 0)
      featPointsSpent.mutation.max = Math.min(13, abhumanLevels + 3);
    return featPointsSpent;
  }

	/**
	* Prep and display stat roll dialog
	*/
  async _onStatRoll(label, defaultStat, defaultRoll, modifiers) {

    const actor = this.actor;
		var adShift = 3;
    const rollData = this.actor.getRollData();

		const dialogData = {
			actor: actor,
      label: label,
      defaultStat: defaultStat,
      defaultRoll: defaultRoll,
      modifiers: modifiers,
			adShift: adShift,
			adLadder: ["+3D", "+2D", "+D", "Normal", "+A", "+2A", "+3A"],
			rollData: rollData
		};

		const template = "systems/redage/templates/dialogs/roll-stat.html";
		const html = await renderTemplate(template, dialogData);

		// this.tempData is a temporary place to store data for inter-function transport
		// the dialog callback only passes its own html as text, so we need a way to move data
		// it can be overwritten as needed
		this.tempData = dialogData;

		const _doRoll = async (html) => { return this._doStatRoll(html, this.tempData); };

		this.popUpDialog = new Dialog({
			title: actor.name + " - " + label,
			content: html,
			default: "roll",
			buttons: {
				roll: {
					label: "Roll",
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
	* Actual processing and output of stat roll
	*/
	async _doStatRoll(html, dialogData) {

		const actor = dialogData.actor;

		dialogData.rollNotes = [];

		// get data from dialog
		var _a;
		const form = html[0].querySelector("form");
		const adShift = parseInt((_a = form.querySelector('[name="adShift"]')) === null || _a === void 0 ? void 0 : _a.value) - 3;
    dialogData.defaultStat = (_a = form.querySelector('[name="defaultStat"]')) === null || _a === void 0 ? void 0 : _a.value;
    dialogData.defaultRoll = (_a = form.querySelector('[name="defaultRoll"]')) === null || _a === void 0 ? void 0 : _a.value;

    if (!dialogData.defaultRoll) dialogData.defaultRoll = "mod";

    dialogData.modifiers = (_a = form.querySelector('[name="modifiers"]')) === null || _a === void 0 ? void 0 : _a.value;
    if (dialogData.defaultRoll.toLowerCase() === "bonus") {
      dialogData.rollData.skilled = "5";
      dialogData.rollData.expert = "10";
    }
    else {
      dialogData.rollData.skilled = actor.data.data.halfProficiencyBonus;
      dialogData.rollData.expert = actor.data.data.proficiencyBonus;
    }

    if (dialogData.defaultStat !== "defenseBonus") {
      dialogData.rollNotes.push(dialogData.defaultStat + " " + dialogData.defaultRoll);
      dialogData.formula = "@" + dialogData.defaultStat.toLowerCase() + "." + dialogData.defaultRoll.toLowerCase();
    }
    else {
      dialogData.formula = "@defenseBonus";
    }

    if (dialogData.modifiers.toLowerCase().includes("skilled"))
      dialogData.rollNotes.push("Skilled");
    else if (dialogData.modifiers.toLowerCase().includes("expert"))
      dialogData.rollNotes.push("Expert");

    if (dialogData.modifiers)
      dialogData.formula = dialogData.formula + " + " + dialogData.modifiers;

    // handle advantage / disadvantage on roll
    let dice = REDAGE.getD20(actor, adShift);
    dialogData.formula = dice + " + " + dialogData.formula;
    const adShiftLadder = ["+3D", "+2D", "+D", "", "+A", "+2A", "+3A"];
    if (adShift != 0) dialogData.rollNotes.push(adShiftLadder[adShift+3]);

		// handle roll
		const statRoll = new Roll(dialogData.formula, dialogData.rollData);
		await statRoll.evaluate({async: true});

		// handle special rolls (crit, fumble)
		const rollD20Result = statRoll.terms[0].total;
		var critThreshold = 20;
		var fumbleThreshold = 1;

		if (rollD20Result >= critThreshold)
			dialogData.rollNotes.push("Crit");
		else if (rollD20Result <= fumbleThreshold)
			dialogData.rollNotes.push("Fumble");

    const rollMode = game.settings.get("core", "rollMode");
		const diceData = Roll.fromTerms([
			PoolTerm.fromRolls([statRoll]),
		]);

		const diceTooltip = { roll: await statRoll.render() };

		dialogData.statRoll = statRoll;
		dialogData.diceTooltip = diceTooltip;
		dialogData.rollNotes = (dialogData.rollNotes.length > 0) ? "(" + dialogData.rollNotes.join(", ") + ")" : "";

		const template = "systems/redage/templates/chat/stat-roll.html";
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

  async _onHealthManager()
  {
    const actor = this.actor;
    const rollData = this.actor.getRollData();

    const dialogData = {
      actor: actor,
      label: "Health & Life",
      rollData: rollData
    };

    const template = "systems/redage/templates/dialogs/health-manager.html";
    const html = await renderTemplate(template, dialogData);
    this.tempData = dialogData;

    const _doHealthManagement = async (html) => {
      let actor = this.tempData.actor.data;
      var _a;
      const form = html[0].querySelector("form");
      var hpVal = parseInt((_a = form.querySelector('[name="health.value"]')) === null || _a === void 0 ? void 0 : _a.value);
      var hpTemp = parseInt((_a = form.querySelector('[name="health.temp"]')) === null || _a === void 0 ? void 0 : _a.value);
      var hpRes = parseInt((_a = form.querySelector('[name="health.reserve"]')) === null || _a === void 0 ? void 0 : _a.value);
      var lifeVal = parseInt((_a = form.querySelector('[name="life.value"]')) === null || _a === void 0 ? void 0 : _a.value);

      hpVal = (!isNaN(hpVal)) ? Math.max(0, Math.min(hpVal, actor.data.health.max)) : 0;
      hpTemp = (!isNaN(hpTemp)) ? Math.max(0, hpTemp) : 0;
      hpRes = (!isNaN(hpRes)) ? Math.max(0, Math.min(hpRes, actor.data.health.max)) : 0;
      lifeVal = (!isNaN(lifeVal)) ? Math.max(0, Math.min(lifeVal, actor.data.life.max)) : 0;
      this.actor.update( { "data.health.value": hpVal, "data.health.temp": hpTemp, "data.health.reserve": hpRes, "data.life.value": lifeVal }, {});
    };

    this.popUpDialog = new Dialog({
      title: dialogData.label,
      content: html,
      default: "close",
      buttons: {
        close: {
          label: "Apply",
          // callback: async (html) => { return this._doHealthManagement(html, this.tempData); },
					callback: (html) => _doHealthManagement(html),
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
  }
}

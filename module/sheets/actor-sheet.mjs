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
      height: 600,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "features" }]
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

		switch (context.data.carried.loadLevel)
		{
		case REDAGE.LOAD_LIGHT: context.data.carried.color = "blue";
			context.data.carried.tooltip = "";
			break;
		case REDAGE.LOAD_MEDIUM: context.data.carried.color = "green";
			context.data.carried.tooltip = "+D to swimming, climbing, jumping, and acrobatics";
			break;
		case REDAGE.LOAD_HEAVY: context.data.carried.color = "yellow";
			context.data.carried.tooltip = "+D to Dex and Vigor stat, save, attack, and effect checks.  +D to initiative.  Slowed.  Can't swim.";
			break;
		default: context.data.carried.color = "red";
			context.data.carried.tooltip = "+D to Dex and Vigor stat, save, attack, and effect checks.  +D to initiative.  Slowed 6x.  Can't swim.  Fatigue every 10 min.";
			break;
		}

		context.data.featPoints = { value: this._calculateFeatPoints(context.items) };
		let mundaneFP = Math.floor(Math.min(context.data.characterLevel, REDAGE.HeroicLevelThreshold) / 2);
		let heroicFP = (context.data.characterLevel - REDAGE.HeroicLevelThreshold > 0) ? context.data.characterLevel - REDAGE.HeroicLevelThreshold : 0;
 		context.data.featPoints.max = 2 + context.data.wits.mod + mundaneFP + heroicFP;

 		// TODO if feat points > max, color it red
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
    const features = [];
    const spells = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
      8: [],
      9: []
    };

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || DEFAULT_TOKEN;
      // Append to gear.
      if (i.type === 'item' || i.type === 'weapon' || i.type === 'armor') {
        i.data.locations = REDAGE.ItemLocations;
        gear.push(i);
      }
      // Append to features.
      else if (i.type === 'feature' || i.type === 'class' || i.type === 'featureFighter') {
        features.push(i);
      }
      // Append to spells.
      else if (i.type === 'spell') {
        if (i.data.spellLevel != undefined) {
          spells[i.data.spellLevel].push(i);
        }
      }
    }

		// sort gear by location
    gear.sort((first, second) => {
   		let one = REDAGE.ordinal(first.data.location, REDAGE.ItemLocations);
   		let two = REDAGE.ordinal(second.data.location, REDAGE.ItemLocations);
   		return one - two;
    });

    // Assign and return
    context.gear = gear;
    context.features = features;
    context.spells = spells;
//     context.locations = REDAGE.ItemLocations;
//
// 		let locationChoices = {};
//     for (let i=0; i < REDAGE.ItemLocations.length; i++) {
// 	    locationChoices[REDAGE.ItemLocations[i]] = REDAGE.ItemLocations[i];
//     }
//     let value = "None";
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
    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.delete();
      li.slideUp(200, () => this.render(false));
    });

    // Active Effect management
    html.find(".effect-control").click(ev => onManageActiveEffect(ev, this.actor));

    // Rollable abilities.
    html.find('.rollable').click(this._onRoll.bind(this));

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
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    // Handle item rolls.
    if (dataset.rollType) {
      if (dataset.rollType == 'item') {
        const itemId = element.closest('.item').dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) return item.roll();
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

  // helper functions
  _calculateClassLevels(items) {   
    let classes = items.filter((item) => { return item.type === "class"; });
    if (classes.length === 0) return 0;
    let classLevels = classes.map(c => c.data.classLevel).reduce((a, b) => a + b);
    return classLevels;
  }

  _calculateFeatPoints(items) {
  	let featPointsSpent = 0;

    for (let i of items) {
      if (i.type === 'feature') {
      	featPointsSpent += i.data.cost;
      }
    }

    return featPointsSpent;
  }
}

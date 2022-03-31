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
			context.data.carried.tooltip = "+D to Dex and Vigor stat, save, attack, and effect checks\n+D to initiative\nSlowed\nCan't swim";
			break;
		default: context.data.carried.color = "red";
			context.data.carried.tooltip = "+D to Dex and Vigor stat, save, attack, and effect checks\n+D to initiative\nSlowed 6x\nCan't swim\nFatigue every 10 min";
			break;
		}

		context.data.readied.color = (context.data.readied.value > context.data.readied.max) ? "red" : "";

    // TODO visual indicator showing that your dex / mod have been capped down by armor (color, small icon)?
    // tooltip of the elements summed into your defense, including clumsy penalty
    // all stats show green / red color and icon to indicate alteration from base

		context.data.featPoints = { value: this._calculateFeatPoints(context.items) };
		let mundaneFP = Math.floor(Math.min(context.data.characterLevel, REDAGE.HeroicLevelThreshold) / 2);
		let heroicFP = (context.data.characterLevel - REDAGE.HeroicLevelThreshold > 0) ? context.data.characterLevel - REDAGE.HeroicLevelThreshold : 0;
 		context.data.featPoints.max = 2 + context.data.wits.mod + mundaneFP + heroicFP;
 		context.data.featPoints.color = (context.data.featPoints.value > context.data.featPoints.max) ? "red" : "";
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
        if (i.data.location == REDAGE.INV_CAMP)
        	gearByLoc.Camp.push(i);
        else if (i.data.location == REDAGE.INV_TOWN)
        	gearByLoc.Town.push(i);
        else
        	gearByLoc.Inventory.push(i);
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
    gearByLoc.Inventory.sort((first, second) => {
   		let one = REDAGE.ordinal(first.data.location, REDAGE.ItemLocations);
   		let two = REDAGE.ordinal(second.data.location, REDAGE.ItemLocations);
   		return one - two;
    });

    // Assign and return
    context.gear = gear;
    context.gearByLoc = gearByLoc;
    context.features = features;
    context.spells = spells;
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
    html.find('.item-inc').click(ev => {
	    ev.preventDefault();
      ev.stopPropagation();
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.data.data.quantity = item.data.data.quantity + 1;
			item.update({ "data.quantity": item.data.data.quantity }, {});
    });
    html.find('.item-dec').click(ev => {
	    ev.preventDefault();
      ev.stopPropagation();
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.data.data.quantity = Math.max(0, item.data.data.quantity - 1);
			item.update({ "data.quantity": item.data.data.quantity }, {});
    });

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

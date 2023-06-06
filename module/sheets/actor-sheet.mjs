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

    // Prepare Party data and items.
    if (actorData.type == 'party') {

      switch (context.data.carried.loadLevel)
      {
      case "Standard": context.data.carried.color = "blue";
        context.data.carried.tooltip = "";
        break;
      default: context.data.carried.color = "red";
        context.data.carried.tooltip = "Each week including significant travel, roll the disaster check with +A";
        break;
      }
  
      const gear = context.items.filter((i) => i.data.group === "item");
      gear.forEach(item => { item.data.locations = REDAGE.ItemLocations; });
      const gearByLoc = {
        Equipment: gear.filter((i) => !i.data.isLoot && i.data.location !== REDAGE.INV_TOWN),
        Treasure: gear.filter((i) => i.data.isLoot && i.data.location !== REDAGE.INV_TOWN),
        Town: gear.filter((i) => i.data.location === REDAGE.INV_TOWN)
      };

      context.gear = gear;
      context.gearByLoc = gearByLoc;
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
    let gearByLoc = {
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

    const statuses = [];
    const statusesByOrigin = {};
    for (let o=0; o < REDAGE.StatusOrigins.length; o++) {
      statusesByOrigin[REDAGE.StatusOrigins[o]] = [];
    }

    // Iterate through items, allocating to containers (avoid container name collision w/ base location options)
    let containers = {};
    context.items.filter(i => i.data.tags.includes("container") && !REDAGE.ItemLocations.includes(i.name)).forEach(i => containers[i._id] = i);

    // collection of non-base location gear for post-sorting
    const containedGear = [];
    const limbo = [];

    for (let i of context.items) {
      i.img = i.img || DEFAULT_TOKEN;

      // Append to gear
      if (i.data.group === "item")
      {
        // add containers to location list, not including self, it this item is a container
        i.data.locations = REDAGE.ItemLocations;
        i.data.containers = Object.values(containers).filter(val => i._id !== val._id).map(val => { return { name: val.name, id: val._id }; });

        i.data.isContainer = (i.data.tags.includes("container") && !REDAGE.ItemLocations.includes(i.name));
        i.data.isExpanded = (i.data.tags.includes("expanded") && i.data.isContainer);
        i.data.noInfoFields = i.data.tags.includes("no_info_fields");

        gear.push(i);
        i.displayName = i.name;
        i.data.isVisible = "";

        if (!REDAGE.ItemLocations.includes(i.data.location))
          containedGear.push(i);
        else if (i.data.location == REDAGE.INV_NONE)
          limbo.push(i);
        else if (i.data.location == REDAGE.INV_CAMP)
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

        // parse display tags
        let displayTags = REDAGE.getCodeTags(i.data.tags, "display:").map(tag => Roll.replaceFormulaData(tag, context));
        i.data.display = displayTags.join(", ");

        if (i.type === 'featureResource' || i.type === 'featureResourceRollable')
        {
          // calculate resource max
          i.data.resource.max = 0;
          const item = context.actor.items.get(i._id);
          const rollData = item.getRollData();
          const roll = new Roll(i.data.resource.maxFormula, rollData);
          if (Roll.validate(i.data.resource.maxFormula)) {
            roll.evaluate({ async: false });
            i.data.resource.max = Number(roll.total);
          }
        }
      }

      // Append to statuses
      else if (i.data.group === "status")
      {
        statuses.push(i);
        if (statusesByOrigin[i.data.origin])
          statusesByOrigin[i.data.origin].push(i);
        else 
          statusesByOrigin["Other"].push(i);
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
        
        // parse display tags
        let displayTags = REDAGE.getCodeTags(i.data.tags, "display:").map(tag => Roll.replaceFormulaData(tag, context));
        i.data.display = displayTags.join(", ");
      }
    }

		// sort gear and spells by location
    gearByLoc.Inventory.sort(REDAGE.locationSort(REDAGE.ItemLocations));
    spellsByLoc.Inventory.sort(REDAGE.locationSort(REDAGE.SpellLocations));

    // put contained gear after its container
    let placement = 0;
    let indent = "";
    do {
      placement = 0;
      indent += "- ";
      let cnt = containedGear.length;
      let tempGearByLoc = { Inventory: [...gearByLoc.Inventory], Camp: [...gearByLoc.Camp], Town: [...gearByLoc.Town] };
      while (cnt--)
      {
        let gearArray = undefined;
        let container = tempGearByLoc.Inventory.find(i => i._id === containedGear[cnt].data.location);
        if (container !== undefined) gearArray = gearByLoc.Inventory;
        else {
          container = tempGearByLoc.Camp.find(i => i.name === containedGear[cnt].data.location);
          if (container !== undefined) gearArray = gearByLoc.Camp;
          else {
            container = tempGearByLoc.Town.find(i => i.name === containedGear[cnt].data.location);
            if (container !== undefined) gearArray = gearByLoc.Town;
          }
        }

        container = containers[container._id];

        if (container !== undefined && gearArray !== undefined)
        {
          // contents of collapsed containers are hidden
          let visContainer = container;
          while (visContainer != undefined) {
            if (!visContainer.data.tags.includes("expanded")) { 
              containedGear[cnt].data.isVisible = "hide"; break;
            }
            visContainer = containers[visContainer.data.location];
          }

          containedGear[cnt].displayName = indent + containedGear[cnt].displayName;
          placement++;
          let index = gearArray.indexOf(container);
          gearArray.splice(index+1, 0, containedGear[cnt]);
          containedGear.splice(cnt, 1);
        }
      }
    }
    while (placement != 0);

    if (containedGear.length > 0)
      limbo.push(...containedGear);
    if (limbo.length > 0) {
      limbo.forEach(i => {
        let item = context.actor.items.get(i._id);
        item.update({ "data.location": REDAGE.INV_NONE }, {})
      });
      gearByLoc = { Limbo: limbo, Inventory: gearByLoc.Inventory, Camp: gearByLoc.Camp, Town: gearByLoc.Town };
    }

    // Assign and return
    context.gear = gear;
    context.gearByLoc = gearByLoc;
    context.features = features;
    context.spells = spells;
    context.spellsByLoc = spellsByLoc;
    context.statuses = statuses;
    context.statusesByOrigin = statusesByOrigin;

    context.statusOrigins = REDAGE.StatusOrigins;
   }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Render the item sheet for viewing/editing prior to the editable check.
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));

      if (item.type == "weapon")
        item.sheet.position.height = 650;

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
    html.find(".item-relocate").on("change", ev => { this._relocate(ev); });

    // Expand / collapse display of container contents
    html.find('.item-expand').click(ev => { 
      ev.preventDefault();
      ev.stopPropagation();
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      let array = item.data.data.tags;

      if (item.data.data.tags.includes("expanded")) {
        const index = array.indexOf("expanded");
        if (index != -1) array.splice(index, 1);
      }
      else {
        array.push("expanded");
      }

      item.update({ data: { tags: array } });
    });

    // Event handlers
    
    // Add and remove item tags
    html.find(".item-text-push").click((ev) => {
      ev.preventDefault();
      const header = ev.currentTarget;
      const table = header.dataset.array;
      REDAGE.pushText(this.actor, table);
    });

    html.find(".item-text-edit").click((ev) => {
      ev.preventDefault();
      const header = ev.currentTarget;
      const table = header.dataset.array;
      const index = header.dataset.id;
      // const text = $(ev.currentTarget).closest(".item").data("tag");
      REDAGE.pushText(this.actor, table, index);
    });

    html.find(".item-text-pop").click((ev) => {
      ev.preventDefault();
      const header = ev.currentTarget;
      const table = header.dataset.array;
      const index = header.dataset.id;
      REDAGE.popText(this.actor, table, index);
    });

    html.find(".item-text-up").click((ev) => {
      ev.preventDefault();
      const header = ev.currentTarget;
      const table = header.dataset.array;
      const index = header.dataset.id;
      REDAGE.moveText(this.actor, table, index, -1);
    });

    html.find(".item-text-down").click((ev) => {
      ev.preventDefault();
      const header = ev.currentTarget;
      const table = header.dataset.array;
      const index = header.dataset.id;
      REDAGE.moveText(this.actor, table, index, 1);
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
    const name = (data.name) ? data.name : `New ${type.capitalize()}`;
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      data: data
    };
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.data["type"];

    // Remove the name from the dataset since it's in the itemData.name prop.
    if (data.name)
      delete itemData.data["name"];

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

    // deleted item containers drop their contents into their parent container or base inventory location
    if (item.data.data.group === "item" && item.data.data.tags.includes("container"))
    {
      let loc = item.data.data.location;
      item.actor.items.filter(i => i.data.data.location == item.name).forEach(i => i.update({ "data.location": loc }, {}));
    }

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

    // party actors can only receive items (not spells, etc)
    if (this.actor.type === "party" && itemData.data.group !== "item")
      return;

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
    else if (item.data.data.group === "status") {
      entry = item.data.data.progress;
      quantityName = "data.progress.value";
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

  _relocate(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const li = $(ev.currentTarget).parents(".item");
    const item = this.actor.items.get(li.data("itemId"));

    let validRelocation = false;
    let loc = ev.currentTarget.value;
    let thisLocation = loc;

    if (item.data.data.group === "item") {
      let containers = {};
      item.actor.items.filter(i => i.data.data.tags.includes("container") && !REDAGE.ItemLocations.includes(i.name)).forEach(i => containers[i.id] = i);

      // walk up the layers of containment, failing in relocation if more than depth 10 passes, or you reach yourself (recursive placement) or an undefined holder
      for (let cnt=0; cnt < 10 && thisLocation !== item.id && thisLocation !== undefined; cnt++) {
        // if we've reached a base location, allow the relocation
        if (REDAGE.ItemLocations.includes(thisLocation)) { validRelocation = true; break; }

        if (containers[thisLocation] !== undefined) { thisLocation = containers[thisLocation].data.data.location; } else { thisLocation = undefined; }
      }
    }
    else {
      validRelocation = true;
    }

    if (validRelocation) {
      item.data.data.location = loc;
      item.update({ "data.location": item.data.data.location }, {});
    }
    else {
      ev.currentTarget.value = item.data.data.location;
      if (thisLocation === item.name)
        ui.notifications.warn("Relocate failed: recursive containers!");
      else
        ui.notifications.warn("Relocate failed!");
    }
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
      // Handle init rolls
      else if (dataset.rollType == 'init') {
        let die = "1d6"
        if (this.actor.data.data.carried.value > this.actor.data.data.carried.max) {
          // heavy or greater load = +D on ish
          die = "2d6kl1"
        }
        let roll = new Roll(die + "+" + this.actor.data.data.init, this.actor.getRollData());
        roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          flavor: "Initiative",
          rollMode: game.settings.get('core', 'rollMode'),
        });
        return roll;
      }
      // Handle  HP / reserve/ tHP / Life / Mana manager dialog
      else if (dataset.rollType == 'resourceManager') {
        this._onResourceManager();
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
			targets: 1,
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
		const adShift = REDAGE.getDialogField(form, "adShift", true) - 3;
		dialogData.defaultStat = REDAGE.getDialogField(form, "defaultStat");
		dialogData.defaultRoll = REDAGE.getDialogField(form, "defaultRoll");
		dialogData.targets = Math.max(1, REDAGE.getDialogField(form, "targets", true));

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

    if (!Roll.validate(dialogData.formula)) {
      REDAGE.prompt("Invalid Roll Formula", "Invalid: " + dialogData.formula);
      return;
    }
  
    // handle advantage / disadvantage on roll
    let dice = REDAGE.getD20(actor.data, adShift);
    dialogData.formula = dice + " + " + dialogData.formula;
    const adShiftLadder = ["+3D", "+2D", "+D", "", "+A", "+2A", "+3A"];
    if (adShift != 0) dialogData.rollNotes.push(adShiftLadder[adShift+3]);

    let specials = { Crit: [20, 1000], Fumble: [-1000, 1] };

    dialogData.rolls = await REDAGE.d20Roll(dialogData.formula, dialogData.targets, dialogData.rollData, specials);
    if (dialogData.rolls.length <= 0) {
      REDAGE.prompt("Roll Handling Failed", "No rolls were processed.");
      return;
    }

    for (let a=0; a < dialogData.rolls.length; a++) {
      const diceTooltip = { roll: await dialogData.rolls[a].roll.render() };
      dialogData.rolls[a].diceTooltip = diceTooltip;
    }

    const rollMode = game.settings.get("core", "rollMode");
    const rollArray = dialogData.rolls.map((x) => {
      return [x.roll];
    }).flat();
    const diceData = Roll.fromTerms([
      PoolTerm.fromRolls(rollArray),
    ]);

    dialogData.rollNotes = (dialogData.rollNotes.length > 0) ? "(" + dialogData.rollNotes.join(", ") + ")" : "";
    dialogData.diceTooltip = { rollRender: await dialogData.rolls[0].roll.render() };

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

  async _onResourceManager()
  {
    const actor = this.actor;
    const rollData = this.actor.getRollData();

    const dialogData = {
      actor: actor,
      label: "Resources",
      rollData: rollData
    };

    const template = "systems/redage/templates/dialogs/resource-manager.html";
    const html = await renderTemplate(template, dialogData);
    this.tempData = dialogData;

    const _doResourceManagement = async (html, action) => {
      let actor = this.tempData.actor.data;
      var _a;
      const form = html[0].querySelector("form");
      var hpVal = parseInt((_a = form.querySelector('[name="health.value"]')) === null || _a === void 0 ? void 0 : _a.value);
      var hpTemp = parseInt((_a = form.querySelector('[name="health.temp"]')) === null || _a === void 0 ? void 0 : _a.value);
      var hpRes = parseInt((_a = form.querySelector('[name="health.reserve"]')) === null || _a === void 0 ? void 0 : _a.value);
      var lifeVal = parseInt((_a = form.querySelector('[name="life.value"]')) === null || _a === void 0 ? void 0 : _a.value);
      var manaVal = parseInt((_a = form.querySelector('[name="mana.value"]')) === null || _a === void 0 ? void 0 : _a.value);
      var cantVal = parseInt((_a = form.querySelector('[name="mana.cantrip"]')) === null || _a === void 0 ? void 0 : _a.value);
      var manaRes = parseInt((_a = form.querySelector('[name="mana.reserve"]')) === null || _a === void 0 ? void 0 : _a.value);

      if (action === "apply") {
        hpVal = (!isNaN(hpVal)) ? Math.max(0, Math.min(hpVal, actor.data.health.max)) : 0;
        hpTemp = (!isNaN(hpTemp)) ? Math.max(0, hpTemp) : 0;
        hpRes = (!isNaN(hpRes)) ? Math.max(0, Math.min(hpRes, actor.data.health.max)) : 0;
        lifeVal = (!isNaN(lifeVal)) ? Math.max(0, Math.min(lifeVal, actor.data.life.max)) : 0;
        manaVal = (!isNaN(manaVal)) ? Math.max(0, Math.min(manaVal, actor.data.mana.max)) : 0;
        cantVal = (!isNaN(cantVal)) ? Math.max(0, Math.min(cantVal, 5)) : 0;
        manaRes = (!isNaN(manaRes)) ? Math.max(0, Math.min(manaRes, actor.data.mana.max)) : 0;

        this.actor.update( { "data.health.value": hpVal, "data.health.temp": hpTemp, "data.health.reserve": hpRes, "data.life.value": lifeVal,
          "data.mana.value": manaVal, "data.mana.cantrip": cantVal, "data.mana.reserve": manaRes }, {});
      }
      else if (action === "cantrips") {
        if (actor.data.mana.cantrip > 0)
          REDAGE.prompt("Refresh Unnecessary", "You still have cantrips.");
        else if (actor.data.mana.value < 1)
          REDAGE.prompt("Refresh Failed", "Insufficient mana.");
        else if (await REDAGE.confirm("Refresh Cantrips", "Spend 1 mana to restore all cantrip mana."))
          this.actor.update( { "data.mana.cantrip": 5, "data.mana.value": actor.data.mana.value-1 }, {});
      }
      else if (action === "short") {
        if (await REDAGE.confirm("Short Rest", "Restore all cantrip mana.  Handle abilities manually."))
          this.actor.update( { "data.mana.cantrip": 5 }, {});
      }
      else if (action === "long") {
        let hpFromReserve = Math.min((actor.data.health.max - actor.data.health.value), actor.data.health.reserve);
        let manaFromReserve = Math.min((actor.data.mana.max - actor.data.mana.value), actor.data.mana.reserve);
        let lifeHeal = (actor.data.life.max > actor.data.life.value) ? "Heal 1 life.  " : "";
        if (await REDAGE.confirm("Long Rest", "Restore " + hpFromReserve + " hp and " + manaFromReserve + " mana from reserve.  " + lifeHeal + "Handle abilities, fatigue, and wounds manually.")) {
          this.actor.update( { "data.health.value": (actor.data.health.value + hpFromReserve), "data.health.reserve": (actor.data.health.reserve - hpFromReserve), 
            "data.life.value": Math.min(actor.data.life.max, actor.data.life.value + 1),
            "data.mana.value": (actor.data.mana.value + manaFromReserve), "data.mana.cantrip": 5, "data.mana.reserve": (actor.data.mana.reserve - manaFromReserve) }, {});
        }
      }
      else if (action === "extended") {
        if (await REDAGE.confirm("Extended Rest", "Restore all hp, life, mana, and reserve.  Handle abilities, fatigue, and wounds manually.")) {
          this.actor.update( { "data.health.value": actor.data.health.max, "data.health.reserve": actor.data.health.max, "data.life.value": actor.data.life.max,
            "data.mana.value": actor.data.mana.max, "data.mana.cantrip": 5, "data.mana.reserve": actor.data.mana.max }, {});
        }
      }
    };

    this.popUpDialog = new Dialog({
      title: dialogData.label,
      content: html,
      default: "apply",
      buttons: {
        apply: {
          label: "Apply Changes",
          // callback: async (html) => { return this._doHealthManagement(html, this.tempData); },
					callback: (html) => _doResourceManagement(html, "apply"),
        },
        cantripRefresh: {
          label: "Refresh Cantrips",
          callback: (html) => _doResourceManagement(html, "cantrips"),
        },
        short: {
          label: "Short Rest",
          callback: (html) => _doResourceManagement(html, "short"),
        },
        long: {
          label: "Long Rest",
          callback: (html) => _doResourceManagement(html, "long"),
        },
        extended: {
          label: "Extended Rest",
          callback: (html) => _doResourceManagement(html, "extended"),
        },
        cancel: {
          label: "Cancel",
          callback: () => { ; },
        }
      },
    });

    this.popUpDialog.position.width = 400;

    const s = this.popUpDialog.render(true);
    if (s instanceof Promise)
      await s;
  }
}

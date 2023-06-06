import { REDAGE } from "../helpers/config.mjs";

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class RedAgeItemSheet extends ItemSheet {

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["redage", "sheet", "item"],
      width: 520,
      height: 480,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }]
    });
  }

  /** @override */
  get template() {
    const path = "systems/redage/templates/item";
    // Return a single sheet for all item types.
    // return `${path}/item-sheet.html`;

    // Alternatively, you could use the following return statement to do a
    // unique item sheet by type, like `weapon-sheet.html`.
    return `${path}/item-${this.item.data.type}-sheet.html`;
  }

  /* -------------------------------------------- */

  /** @override */
  getData() {
    // Retrieve base data structure.
    const context = super.getData();

    // Use a safe clone of the item data for further operations.
    const itemData = context.item.data;

    // Retrieve the roll data for TinyMCE editors.
    context.rollData = {};
    let actor = this.object?.parent ?? null;
    if (actor) {
      context.rollData = actor.getRollData();
    }

    // Add the actor's data to context.data for easier access, as well as flags.
    context.data = itemData.data;
    context.flags = itemData.flags;

    context.location = itemData.data.location;
    context.locations = REDAGE.ItemLocations;

    // Iterate through items, allocating to containers (avoid container name collision w/ base location options)
    // add containers to location list, not including self, it this item is a container
    let containers = {};
    actor.items.filter(i => i.data.data.tags.includes("container") && !REDAGE.ItemLocations.includes(i.name)).forEach(i => containers[i.id] = i);
    context.containers = Object.values(containers).filter(val => context.item.id !== val.id).map(val => { return { name: val.name, id: val.id }; });

    context.spellLocations = REDAGE.SpellLocations;
    context.statusOrigins = REDAGE.StatusOrigins;

    // casting preparation
    if (this.item.type === "classCaster")
      this._calculateCasting(context);

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Event handlers
    
    // Add and remove item tags
    html.find(".item-text-push").click((ev) => {
      ev.preventDefault();
      const header = ev.currentTarget;
      const table = header.dataset.array;
      REDAGE.pushText(this.item, table);
    });

    html.find(".item-text-edit").click((ev) => {
      ev.preventDefault();
      const header = ev.currentTarget;
      const table = header.dataset.array;
      const index = header.dataset.id;
      // const text = $(ev.currentTarget).closest(".item").data("tag");
      REDAGE.pushText(this.item, table, index);
    });

    html.find(".item-text-pop").click((ev) => {
      ev.preventDefault();
      const header = ev.currentTarget;
      const table = header.dataset.array;
      const index = header.dataset.id;
      REDAGE.popText(this.item, table, index);
    });

    html.find(".item-text-up").click((ev) => {
      ev.preventDefault();
      const header = ev.currentTarget;
      const table = header.dataset.array;
      const index = header.dataset.id;
      REDAGE.moveText(this.item, table, index, -1);
    });

    html.find(".item-text-down").click((ev) => {
      ev.preventDefault();
      const header = ev.currentTarget;
      const table = header.dataset.array;
      const index = header.dataset.id;
      REDAGE.moveText(this.item, table, index, 1);
    });

    // Relocate item in inventory
    html.find(".item-relocate").on("change", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const item = this.item;

      let loc = ev.currentTarget.value;
      let containers = {};
      item.actor.items.filter(i => i.data.data.tags.includes("container") && !REDAGE.ItemLocations.includes(i.id)).forEach(i => containers[i.id] = i);

      // walk up the layers of containment, failing in relocation if more than depth 10 passes, or you reach yourself (recursive placement) or an undefined holder
      let thisLocation = loc;
      let validRelocation = false;
      for (let cnt=0; cnt < 10 && thisLocation !== item.id && thisLocation !== undefined; cnt++) {
        // if we've reached a base location, allow the relocation
        if (REDAGE.ItemLocations.includes(thisLocation)) { validRelocation = true; break; }

        if (containers[thisLocation] !== undefined) { thisLocation = containers[thisLocation].data.data.location; } else { thisLocation = undefined; }
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
    });    
  }

  _calculateCasting(context) {
    const data = context.data;
    let actorData = context.rollData;
    actorData.level = data.classLevel;
  
    // half-casters get spell Power at half the rate of full casters
    if (data.isHalfcaster)
      data.maxPower = Math.ceil(Math.min(10, data.classLevel) / 4);
    else
      data.maxPower = Math.ceil(Math.min(10, data.classLevel) / 2);
    
    data.spells.primary.max = 0;
    if (Roll.validate(data.spells.primary.formula)) {
      let val = new Roll(data.spells.primary.formula, actorData);
      val.evaluate({async: false});
      data.spells.primary.max = val.total;
    }

    data.spells.secondary.max = 0;
    if (Roll.validate(data.spells.secondary.formula)) {
      let val = new Roll(data.spells.secondary.formula, actorData);
      val.evaluate({async: false});
      data.spells.secondary.max = val.total;
    }

    // number of instruments of panoply equipped
    let instruments = ["hand", "body", "token", "order", "sanctum", "patron", "transfiguration", "familiar"];
    data.panoply.count = 0;
    for (let i=0; i < instruments.length; i++) {
      if (data.panoply[instruments[i]]) data.panoply.count++;
    }

    // need this calculated when the sheet changes / closes, but has to be updated or it will be lost with context
    this.item.update({ 
      "data.maxPower": data.maxPower,
      "data.spells.primary.max": data.spells.primary.max,
      "data.spells.secondary.max": data.spells.secondary.max,
      "data.panoply.count": data.panoply.count
      }, {});
  }
}


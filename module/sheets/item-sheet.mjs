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

    context.locations = REDAGE.ItemLocations;
    context.spellLocations = REDAGE.SpellLocations;

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

    // (arcane) preppable / innate spells OR (divine) world affinities (std) and divine bonds (bonus)
    data.spellCapacity.standard = 0;
    data.spellCapacity.bonus = 0;

    if (Roll.validate(data.spellCapacity.standardFormula)) {
      let val = new Roll(data.spellCapacity.standardFormula, actorData);
      val.evaluate({async: false});
      data.spellCapacity.standard = val.total;
    }
    if (Roll.validate(data.spellCapacity.bonusFormula)) {
      let val = new Roll(data.spellCapacity.bonusFormula, actorData);
      val.evaluate({async: false});
      data.spellCapacity.bonus = val.total;
    }
  
    // number of instruments of panoply equipped
    let instruments = ["hand", "body", "token", "order", "sanctum", "patron", "transfiguration", "familiar"];
    data.panoply.count = 0;
    for (let i=0; i < instruments.length; i++) {
      if (data.panoply[instruments[i]]) data.panoply.count++;
    }
  }
}


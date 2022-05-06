export const REDAGE = {};

REDAGE.HeroicLevelThreshold = 10;

REDAGE.INV_NONE = "None";
REDAGE.INV_READY = "Readied";
REDAGE.INV_WORN = "Worn";
REDAGE.INV_STOWED = "Stowed";
REDAGE.INV_CAMP = "Camp";
REDAGE.INV_TOWN = "Town";

REDAGE.ItemLocations = [
	REDAGE.INV_NONE,
	REDAGE.INV_READY,
	REDAGE.INV_WORN,
	REDAGE.INV_STOWED,
	REDAGE.INV_CAMP,
	REDAGE.INV_TOWN
];

REDAGE.LOAD_LIGHT = "Light";
REDAGE.LOAD_MEDIUM = "Medium";
REDAGE.LOAD_HEAVY = "Heavy";
REDAGE.LOAD_OVERLOADED = "Overloaded";

REDAGE.LoadLevels = [
	REDAGE.LOAD_LIGHT,
	REDAGE.LOAD_MEDIUM,
	REDAGE.LOAD_HEAVY,
	REDAGE.LOAD_OVERLOADED
];

REDAGE.WeaponProficiencyGroups = [
  "Brawling",
  "Exotic",
  "Great",
  "Missile",
  "Pole",
  "Single",
  "Thrown"
];

REDAGE.WeaponAmmunitionType = [
  "Arrow",
  "Bolt",
  "Stone"
];

REDAGE.ArmorProficiencyGroups = [
  "Light",
  "Medium",
  "Heavy",
  "Shield"
];

REDAGE.PanoplyTypes = [
  "Assistance",
  "Familiar",
  "Implement",
  "Order",
  "Patron",
  "PowerFont",
  "Raiment",
  "Ritual",
  "Sacrament",
  "Sanctity",
  "Sanctum",
  "Talisman",
  "Transfiguration"
];

REDAGE.DamageTypes = [
	"Crushing",
	"Piercing",
	"Slashing",
	"Fire",
	"Frost",
	"Acid",
	"Health",
	"Spirit",
	"Healing"
];

REDAGE.SPELL_NONE = "None";
REDAGE.SPELL_PREPARED = "Prepared";
REDAGE.SPELL_INNATE = "Innate";
REDAGE.SPELL_VESSEL = "Vessel";
REDAGE.SPELL_PANOPLY = "Panoply";
REDAGE.SPELL_CAMP = "Camp";
REDAGE.SPELL_TOWN = "Town";

REDAGE.SpellLocations = [
	REDAGE.SPELL_NONE,
	REDAGE.SPELL_PREPARED,
	REDAGE.SPELL_INNATE,
	REDAGE.SPELL_VESSEL,
	REDAGE.SPELL_PANOPLY,
	REDAGE.SPELL_CAMP,
	REDAGE.SPELL_TOWN
];

REDAGE.ManaCost = [
	0.2,
	2,
	3,
	5,
	6,
	7,
	9,
	10,
	11,
	13
];


/**
* Return index of element's location in list, or list.length+1 if not found
*/
REDAGE.ordinal = function(listElement, list) {
  let result = list.findIndex(element => element === listElement);
  return (result == -1) ? list.length+1 : result;
}

/**
* Checks if item is of one of the types specified in the list
*/
REDAGE.isType = function(item, list) {

  let result = list.findIndex(element => element === item.type);
  return (result != -1);
}

/**
* Composes the d20 roll for stat check / attacks / spell effects, applying conditions that grant +A/D and other modifiers
*/
REDAGE.getD20 = function(actor, adShift, params = { noFatigue: false, noEncumbrance: false }) {
  // handle advantage / disadvantage on roll
  var dice = (Math.abs(adShift)+1) + "d20";
  if (adShift < 0) dice += "kl1"; else if (adShift > 0) dice += "kh1";

  if (!params || !params.noFatigue) {
    // apply fatigue
    // TODO
  }

  if (!params || !params.noEncumbrance) {
    // apply encumbrance level
    // TODO
  }

  return dice;
}

REDAGE.enterText = async function (text) {
  let templateData = { dialogText: text },
    dlg = await renderTemplate("systems/redage/templates/dialogs/text-prompt.html", templateData);

  return new Promise((resolve) => {
    new Dialog({
      title: "",
      content: dlg,
      buttons: {
        ok: {
          label: "Ok",
          icon: '<i class="fas fa-check"></i>',
          callback: (html) => {
            resolve({
              dialogText: html.find('input[name="dialogText"]').val(),
            });
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
        },
      },
      default: "ok",
    }).render(true);
  });
}

REDAGE.pushText = async function (item, table, index = null) {
  const data = item.data.data;
  let update = duplicate(data[table]);
  let initial = update[index];

  REDAGE.enterText(initial).then((dialogInput) => {
    const text = dialogInput.dialogText.trim();
    if (text === null || text === "")
      return;

    if (update && text)
    {
      if (index === null)
        update.push(text);
      else if (index >= 0 && index < update.length)
        update[index] = text;
    }
    else
    {
      update = [text];
    }

    let newData = {};
    newData[table] = update;
    return item.update({ data: newData });
  });
}

REDAGE.popText = async function (item, table, index) {
  const data = item.data.data;
  let update = duplicate(data[table]);
  update.splice(index, 1);
  let newData = {};
  newData[table] = update;
  return item.update({ data: newData });
}

REDAGE.moveText = async function (item, table, index, shift) {
  const data = item.data.data;
  let update = duplicate(data[table]);
  index = Number(index);
  shift = Number(shift);

  if (index+shift < 0 || index+shift >= update.length)
    return;

  let text = update[index];
  update.splice(index, 1);
  update.splice(index+shift, 0, text);

  let newData = {};
  newData[table] = update;
  return item.update({ data: newData });
}

REDAGE.prompt = async function (title, content, callback = () => { ; }) {
  return Dialog.prompt({ title: title, content: content, callback: callback });
}

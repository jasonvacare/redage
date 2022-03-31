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

/**
* Return index of element's location in list, or list.length+1 if not found
*/
REDAGE.ordinal = function(listElement, list) {
  let result = list.findIndex(element => element === listElement);
  return (result == -1) ? list.length+1 : result;
}
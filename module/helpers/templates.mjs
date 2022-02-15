/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
 export const preloadHandlebarsTemplates = async function() {
  return loadTemplates([

    // Actor partials.
    "systems/redage/templates/actor/parts/actor-features.html",
    "systems/redage/templates/actor/parts/actor-items.html",
    "systems/redage/templates/actor/parts/actor-spells.html",
    "systems/redage/templates/actor/parts/actor-effects.html",

		// Item partials.
		"systems/redage/templates/item/parts/item-basics-sheet.html",

  ]);
};

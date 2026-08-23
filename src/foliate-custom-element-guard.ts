const FOLIATE_ELEMENTS = new Set(["foliate-view", "foliate-fxl", "foliate-paginator"]);
const PATCH_FLAG = "__omniFoliateElementGuardInstalled__";
const ORIGINAL_DEFINE_KEY = "__omniOriginalCustomElementDefine__";

type GuardWindow = typeof window & {
  [PATCH_FLAG]?: boolean;
  [ORIGINAL_DEFINE_KEY]?: CustomElementRegistry["define"];
};

/** Allow Omni and other Foliate-based plugins to coexist in one WebView. */
export function installFoliateCustomElementGuard(registry: CustomElementRegistry = customElements): void {
  const scope = window as GuardWindow;
  if (scope[PATCH_FLAG]) return;
  const original = registry.define.bind(registry);
  scope[ORIGINAL_DEFINE_KEY] = original;
  registry.define = function guardedDefine(
    this: CustomElementRegistry,
    name: string,
    constructor: CustomElementConstructor,
    options?: ElementDefinitionOptions,
  ): void {
    if (FOLIATE_ELEMENTS.has(name) && this.get(name)) return;
    original(name, constructor, options);
  };
  scope[PATCH_FLAG] = true;
}

export function resetFoliateCustomElementGuardForTests(): void {
  const scope = window as GuardWindow;
  if (scope[ORIGINAL_DEFINE_KEY]) customElements.define = scope[ORIGINAL_DEFINE_KEY];
  delete scope[PATCH_FLAG];
  delete scope[ORIGINAL_DEFINE_KEY];
}

if (typeof customElements !== "undefined") installFoliateCustomElementGuard();

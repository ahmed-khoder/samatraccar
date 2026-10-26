// Lets Node's test runner load the app's TypeScript modules, which import siblings without an extension (as Next does).
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (e?.code === "ERR_MODULE_NOT_FOUND" && /^\.{1,2}\//.test(specifier) && !/\.\w+$/.test(specifier)) return next(specifier + ".ts", context);
      throw e;
    }
  },
});

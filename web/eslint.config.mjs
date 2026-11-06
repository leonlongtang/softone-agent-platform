import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// DESIGN.md → Motion: transitions live in globals.css, transform/opacity only, no animation library.
// Catches what `npx shadcn add` brings back: `transition-all` and tw-animate-css classes.
const MOTION = /\b(transition-all|animate-(in|out)|(fade|zoom|slide)-(in|out))/;
const motionMessage = "DESIGN.md → Motion: transitions live in globals.css, transform/opacity only.";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": ["error",
        { selector: `Literal[value=${MOTION}]`, message: motionMessage },
        { selector: `TemplateElement[value.raw=${MOTION}]`, message: motionMessage },
      ],
      "no-restricted-imports": ["error", {
        paths: ["motion", "motion/react", "framer-motion"].map((name) => ({ name, message: "DESIGN.md → Motion: CSS only." })),
      }],
    },
  },
]);

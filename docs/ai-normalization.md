# AI Normalization Step

The extractor deliberately captures raw browser facts. A second pass should turn those facts into a cleaner design-system model before Figma generation.

Use this step with Claude, GPT, or another model after `design-system.json` is produced.

## Input

Pass the full extraction JSON, or a reduced version containing:

- `source`
- `tokens.colors`
- `tokens.typography`
- `tokens.radii`
- `tokens.shadows`
- `tokens.spacing`
- `components`

## Output Contract

The model should return JSON with this shape:

```json
{
  "semanticTokens": {
    "colors": [
      {
        "name": "color/bg/elevated-primary",
        "value": "#303030",
        "aliases": ["color/gray/800"],
        "rationale": "Used repeatedly as elevated container backgrounds."
      }
    ],
    "typography": [],
    "spacing": [],
    "radii": [],
    "shadows": []
  },
  "componentModel": [
    {
      "name": "Button",
      "category": "button",
      "variants": {
        "state": ["default", "hover", "disabled"],
        "size": ["icon", "default"],
        "tone": ["primary", "secondary", "ghost"]
      },
      "sourceComponentIds": ["component-1"],
      "slots": ["icon", "label"],
      "rationale": "Grouped by role, dimensions, shared icon/text structure, and repeated usage."
    }
  ]
}
```

## Prompt

```text
You are converting raw browser extraction data into a professional Figma design-system draft.

Rules:
- Preserve exact source values.
- Do not invent colors, type styles, or component states that are not evidenced by the input.
- Merge duplicate raw tokens into semantic tokens only when usage and visual similarity support the merge.
- Prefer names like color/bg/elevated-primary, color/fg/tertiary, radius/control, shadow/elevated, type/body-small-regular.
- Group components by user-facing role, not DOM tag alone.
- Keep sourceComponentIds so every semantic component can be traced back to raw examples.
- Return JSON only.

Input:
<design-system-json>
```

## Why This Exists

The browser extractor can reliably observe values, but it cannot always know intent. For example:

- `#181818` might be a page background, a sidebar background, or an elevated surface.
- `button`, `a[role=button]`, and clickable `div` elements can all be the same design component.
- Hover/focus/active states may appear as class names, aria attributes, or separate DOM snapshots.

The AI pass is where raw evidence becomes a cleaner system like the Figma file we inspected.


# `<solid-image-pins>`

Numbered pins on a picture:
- a body map of where someone was hurt (the built-in body figure);
- a floor plan with assets or requests on it;
- a drawing with defects pinned on it.

It is the same element each time; only the picture differs. Each pin has a kind (which sets its
colour), the region of the figure under it, and a note.

| Option | Default | |
|---|---|---|
| `figure` | `"body"` | The built-in body figure: a Front and a Back view made of named regions (see below). It is used whenever there is no `image` or `views`. |
| `image` | none | A custom image instead of the figure: a URL relative to the app (`api/getFile/<fileNo>`, a file under `vendor/…`) or absolute. It is one view; regions are free text then. |
| `views` | none | Several custom images side by side: `[{ "name": "ground", "label": "Ground floor", "image": "…" }]`. Pins store the `name`. Without `views` or `image`, the views are `front` and `back`. |
| `kinds` | injury kinds on the body figure, none otherwise | Pin categories: `[{ "name": "Crack", "color": "#e5484d" }]` or plain names (`["Crack", "Leak"]`). A kind without a colour gets one from its name, the same everywhere. The default for the body is Cut, Bruise, Burn, Fracture, Sprain or strain, Pain and Other. A pin whose stored kind isn't listed shows in a neutral grey. |
| `maxPins` | `30` | The most pins the field takes. At the limit, clicks add nothing, **Add pin** is disabled, and a note says why. |
| `readOnly` | `false` | Shows the pins and the list without editing. The element is also read-only while the field is disabled (`enabled: false`, or a ruleset disabling it). |
| `hideLabel` | `false` | |
| `mandatory` | `false` | Shows the required marker. fieldtec-web's validation decides whether an empty list stops a save, and its messages show under the element. |

**Stored value.** One entry per pin, numbered by its place in the list:

```json
[{ "id": "id-3-k2j9x1", "x": 0.8, "y": 0.5305, "view": "front", "region": "Left wrist", "kind": "Sprain or strain", "note": "Put a hand out when falling" }]
```

- `x` and `y` are fractions (0 to 1, four places) of the view's width and height, so a pin stays put
  however large the figure or image is shown.
- `view` is the view's name: `front` or `back` on the body figure, an image's `name`, or `image` for a
  single `image`.
- `region` is the figure's region under the pin, or free text on custom images. `kind` and `note` are
  left out when empty.
- New pins get their ids from fieldtec-web's `OfflineUtilService.getNextId()`.
- Reading a stored value:
  - an entry without numeric `x` and `y` is dropped;
  - one without an `id` gets one from its place in the list;
  - one without a `view` goes on the first view.

**The body figure** (`src/body.ts`) is a neutral, stylised person drawn as inline SVG from smooth
outlines, 200 × 420 units per view. Every region is its own `<path data-region="…">`. Joints (knees,
elbows, wrists, ankles), shoulders, the face and the eyes are drawn over the parts they join. A point
belongs to the topmost region under it, so the regions cover the whole silhouette without gaps.

- **Left and right are the person's.** On the Front view, the person's left is on the viewer's right;
  on the Back view, it is on the viewer's left.
- Each view has small R and L marks, and a note under the figure says "R and L are the person's right
  and left."
- **Front** (34 regions): Head, Face, Right eye, Left eye, Right ear, Left ear, Neck, Right shoulder,
  Left shoulder, Chest, Abdomen, Right hip, Left hip, Groin, then for each side the upper arm, elbow,
  forearm, wrist, hand, thigh, knee, lower leg, ankle and foot ("Right upper arm" … "Left foot").
- **Back** (30 regions): Back of head, Right ear, Left ear, Back of neck, Right shoulder, Left
  shoulder, Upper back, Lower back, Right buttock, Left buttock, then for each side "Back of right
  upper arm", "Right elbow", "Back of right forearm", "Right wrist", "Back of right hand", "Back of
  right thigh", "Back of right knee", "Right calf", "Right ankle" and "Right heel", and the same for
  the left side.

`src/body-regions.ts` lists every region of both views in reading order (head to toe, the person's
right before their left). Each entry has its group and the point a pin for it goes to, as x and y
fractions, the coordinates a pin stores. It is plain data with no imports, so a Node script can
import it directly, for example to seed pins by region name:

```js
import { BODY_REGIONS } from '../solidjs-components-shared/components/image-pins/src/body-regions.ts';
const knee = BODY_REGIONS.front.find((r) => r.name === 'Left knee'); // { name, group: 'Left leg', x, y }
```

It is made from the geometry. If the figure changes, `UPDATE_BODY_REGIONS=1 pnpm test` rewrites it;
otherwise the unit test fails.

**Behaviour.**
- **Views.** Views sit side by side, and stack when the element is narrow.
- **Hover.** Moving over the figure highlights the region and shows its name. Regions with pins are
  tinted in the first pin's kind colour.
- **Adding.** Clicking adds a pin exactly there, with the region under the pointer, and opens its
  editor. On the figure, a click outside the body adds nothing and says so. On custom images, any spot
  counts.
- **Moving.** Pins are numbered buttons in their kind's colour; drag one to move it. Its position and
  region are written when it is dropped. A pin dropped off the figure goes back where it was.
- **The editor** opens in a popover, the kit's `Popover`, from a pin or its row in the list. It has:
  - **Kind** chips (pressing the chosen one again clears it);
  - **Region**: a select of the view's regions, grouped as Head and neck, Torso, Right arm and so on.
    Choosing another region moves the pin to that region's centre, so its place and its label agree.
    On custom images it is a text box, **Where**.
  - **Note**;
  - **Delete pin**.
- **The list** under the figure gives each pin's number, region, view, kind and note. Clicking a row
  opens that pin's editor.
- **Writing.** Every completed change writes the field: adding, a kind, a region, a drop, a nudge,
  deleting, undoing. The note is written 400 ms after typing stops, and straight away when the box
  loses focus or the editor closes. Each change is made to the value as it is at that moment, so
  changes made elsewhere aren't lost.
- **Deleting** has no confirmation step. A note offers **Undo** for 15 seconds, which puts the pin back
  where it was in the list.

**Keyboard and screen readers.** Everything works without a pointer:
- **Adding.** **Add pin** sits under the figure, with a View select (when there are several views) and
  a Region select. It places the pin at the region's centre, beside any pin already there, and opens
  its editor. On custom images it places the pin in the middle of the view.
- **The pin itself.** A focused pin:
  - opens with Enter or Space;
  - moves with the arrow keys, 1 % of the view per press, 5 % with Shift (a pin can't be moved off the
    body);
  - is removed with Delete or Backspace, with Undo offered.
- **The editor** takes focus when it opens. Esc or **Done** closes it and puts focus back on the pin.
- **What is announced.** Pins are named "Pin 2: Left knee, Cut (Front)" and describe their keys. The
  SVG is hidden from screen readers (the list and the selects carry the same information). A live
  region says what changed: added, moved to another region, removed, restored.

**Example** (where an injured person was hurt):

```json
{ "componentName": "solid-image-pins", "name": "injuryPinsArr", "label": "Where were they hurt?", "fullWidth": true, "mandatory": true }
```

Defects on a floor plan:

```json
{
  "componentName": "solid-image-pins",
  "name": "defectPinsArr",
  "label": "Defects",
  "image": "api/getFile/8f0c…",
  "kinds": [{ "name": "Crack", "color": "#e5484d" }, { "name": "Leak", "color": "#3e8ff7" }, "Trip hazard"]
}
```

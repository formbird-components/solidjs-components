# `<solid-photo-capture>`

Photos on a record: incident photos, evidence that a corrective action was done, before and after
photos. With `allowFiles`, other files too (PDFs, documents). It replaces `sc-uploader` for photos.

- **Adding.** Edit mode shows a grid of square thumbnails with each caption under it, and an add tile
  with **Take photo** and **Upload**. You can also drop files onto the element, several at once.
- **Uploading.** Each file uploads as soon as it is chosen, through the kit's `uploadFile`, owned by the
  form's document (its id and summary name). While it uploads, its tile shows a spinner and the file
  name. The field changes only once the upload has succeeded.
- **Lightbox.** Clicking a thumbnail opens a lightbox with the photo, "3 of 7", the caption, when it
  was taken and by whom, a download link and **Delete**.

fieldtec-web's file reference template uses the element in `mode: "view"` on its `fileDetails` field.
That field holds the server's own file record, and the element shows it: images as photos, other
files as file tiles with a download link.

| Option | Default | |
|---|---|---|
| `mode` | `"edit"` | `"edit"` adds, captions and removes. `"view"` only shows: no add tile, no caption box, no Delete. The element is also view-only while the field is disabled (`enabled: false`, `readOnly: true`, or a ruleset disabling it). |
| `maxPhotos` | `20` | The most entries the field takes, uploads in progress included. When files would go over it, only the ones that fit are uploaded, and a note says how many were left out. When the field is full, the add buttons are disabled (`aria-disabled`, still focusable) with "20 of 20: remove one to add another." |
| `accept` | `"image/*"` | What **Upload** and dropping take, written the way `<input accept>` takes it (`"image/*,.pdf"`, `"application/pdf"`). Dropped files skip the browser's own check, so the element checks them too, and turns others away on their tile ("Only photos can be added here.") without uploading them. **Take photo** always takes `image/*`. |
| `allowFiles` | `false` | Take other files besides photos. With no `accept` it then takes any file, and the server still refuses types it doesn't allow (fieldtec-web's `fileUploader.extensionWhitelist`). Other files show as file tiles (an icon and the extension, the name as a download link). The header counts photos and files separately: "3 photos · 1 file". |
| `captions` | `true` | Show captions under the thumbnails and edit them in the lightbox. `false` hides them (stored captions are kept). |
| `capture` | `"environment"` | The camera **Take photo** asks for: `"environment"` (the back camera) or `"user"` (the front one). `false` or `""` leaves `capture` off, so phones offer the photo library as well. |
| `maxDimension` | `1920` | Photos longer than this on either side are scaled down to fit before they upload. `0` keeps originals. See **Scaling** below. |
| `layout` | `"grid"` | `"list"`: documents as rows (an attachments list) instead of photo thumbnails. See **Documents** below. |
| `kinds` | none | Document types to choose from for each file, stored as `kind`: strings (`["Quote", "Invoice"]`) or `{ value, label }` objects. Use objects when the same template has `solid-line-items`, whose `kinds` are objects: Elasticsearch can't index one field as both. |
| `defaultKind` | the first of `kinds` | The type a new file gets. |
| `hideLabel` | `false` | |
| `mandatory` | `false` | Shows the required marker. fieldtec-web's own validation decides whether an empty list stops a save, and its messages show under the element, as with the other elements. |

**Stored value.** An array of fieldtec-web file records with a few extras:

```json
[
  {
    "fileNo": "4b6c…",
    "fileName": "IMG_2041.jpg",
    "fileType": "jpg",
    "basePath": "20261103",
    "caption": "Wet floor sign put out",
    "takenDate": "2026-11-03T09:12:00.000Z",
    "takenByRel": [{ "documentId": "<account>", "name": "Priya Natarajan" }],
    "width": 1440,
    "height": 1920
  }
]
```

- `fileNo`, `fileType` and `basePath` are what the upload returned. `fileType` is the extension the
  server worked out.
- `takenDate` is when the upload finished, and `takenByRel` is the signed-in user.
- `width` and `height` are the pixel size uploaded; they are left out for files that aren't images.
- `caption` is left out until one is written.

The element also reads a single record instead of an array (`{ fileNo, fileName, … }`) and any
entries with `mimeDetailsObj: { contentType }`. Entries it can't show (no `fileNo`) stay in the value
untouched. A changed list is written back as an array.

**Behaviour.**
- **Showing photos.** Each file is shown from the kit's `fileSource`: fieldtec-web's cached copy when
  it has one (offline), else `api/getFile/<fileNo>`. A photo just uploaded is shown from the local copy,
  so it isn't downloaded again. Thumbnails load only when they come within about 240 px of the
  viewport (`IntersectionObserver` and `loading="lazy"`). An image that fails to load shows a file tile
  instead, and the lightbox says it can't be shown.
- **Other people's changes.** A finished upload is appended to the field's value as it is at that
  moment, not to the value when the upload started. So uploads running side by side, a ruleset, or
  another element on the same field can't lose each other's entries. Captions and deletes change one
  entry (the first with that `fileNo`) and leave the rest alone.
- **Failures.** A refused upload (for example "File type not allowed: exe") stays as a tile with the
  file name and the server's message, from the kit's `errorText`, until it is dismissed. Nothing is
  written for it.
- **Captions** are written 400 ms after typing stops, or straight away on Enter, on leaving the box,
  and on moving to another photo.
- **Delete** asks first ("Remove it from this record? The stored file isn't deleted.") and then
  removes the entry from the field. The file itself stays with fieldtec-web, along with its file
  reference document. The lightbox moves on to the next photo, and closes after the last one.

**Scaling.** Phone cameras take 12-megapixel photos, far more than a record needs. A JPEG, PNG, WebP
or BMP whose longer side is over `maxDimension` is drawn into a canvas at the fitting size (EXIF
rotation applied) and uploaded as a JPEG at quality 0.85, renamed `….jpg`. A PNG or WebP that has
transparent pixels stays a PNG (`….png`), so a transparent background doesn't turn black. These go
up untouched:
- photos that already fit;
- GIFs (which may be animated) and SVGs;
- anything the browser can't decode, such as HEIC on most browsers;
- files that aren't images.

**Accessibility.**
- Thumbnails are buttons named "Open \<caption or file name\>, 2 of 5", and every image's alt text is
  its caption, else its file name.
- The lightbox is a modal `<dialog>` (`role="dialog"`, `aria-modal="true"`) titled by its counter and
  caption.
  - Focus moves to its Close button and Tab stays inside it.
  - ← and → move between photos, wrapping at the ends (not while typing a caption).
  - Esc closes it, and focus goes back to the thumbnail that opened it.
- A polite live region says what happened: "Uploading spill.png…", "spill.png added.", the reason a
  file was refused, "… removed from the record."

**Example** (an incident's photos):

```json
{ "componentName": "solid-photo-capture", "name": "photosArr", "label": "Photos", "fullWidth": true, "maxPhotos": 12 }
```

Evidence that a corrective action was done, with documents too:

```json
{ "componentName": "solid-photo-capture", "name": "evidenceArr", "label": "Evidence", "allowFiles": true, "accept": "image/*,.pdf,.docx" }
```

## Documents

With `layout: "list"` the element is an attachments list (procurement's quotes and invoices):
- each file is a row: an icon with its extension (PDFs red, images blue), its caption or name, "Added
  3 Nov 2026, 9:12 am by Nadia Haddad", its type (a select while editing, a chip when not) and a
  download button;
- uploads show as rows with a spinner, refusals as rows with the server's message;
- **Upload** and **Scan with the camera** sit under the list; files can be dropped on it too;
- the header counts "2 documents";
- clicking a row opens the lightbox, which shows a **PDF in the browser's own viewer** (in either
  layout), images as photos, and other files with a download button. The lightbox shows the type.

Typical use, with `allowFiles: true`, `accept: ".pdf,image/*"` and `kinds`.


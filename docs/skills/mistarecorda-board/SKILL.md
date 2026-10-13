---
name: mistarecorda-board
description: Prepare editable MistaRecorda tutorial diagrams using its authenticated drawing MCP server. Use when the user asks Codex to draw or prepare a recording board.
---

# Prepare a MistaRecorda board

Connect the `mistarecorda` MCP server using the URL and session token shown in the app's Drawing board panel. Never commit or repeat the token. Read the `mistarecorda://drawing-guide` resource and call `board_get` first. The server also supplies these instructions during MCP initialization.

1. Establish the explanation and source material. For a YouTube tutorial, use a transcript and relevant frames obtained through the user's authorized tools. These drawing tools do not watch or download videos. Report missing source material rather than inventing its contents.
2. Inspect the current scene, object IDs, dimensions and viewport. Preserve existing work. Select `board_mode` with `mode: "board"` for the opaque whiteboard or `"screen"` for transparent annotations. Changing mode does not clear either scene.
3. Plan a readable diagram within the reported width and height. Coordinates are canvas pixels: positive x right, positive y down. Start with 60px margins, 24–40px text, 60px gaps and short labels. Keep labels separate and editable. Use consistent colors and stable descriptive IDs.
4. Call `board_draw` with a batch of elements. Supported types: rectangle, ellipse, diamond, text, arrow, line, freedraw. Set x, y, width, height; for text also set text/fontSize. Arrow and freehand `points` are relative to x/y. Use matching `groupIds` to group a label and shape. Arrows should end at shape edges, away from labels.
5. Call `board_screenshot` and inspect the image if supported by the client. Correct overlaps and clipping using `board_update` with existing IDs. Do not claim visual review if the client cannot show the returned image. `board_delete` deletes only the specified IDs.
6. Frame the explanation with `board_view`: zoom, scrollX, scrollY. At zoom z, a world coordinate x appears at `(x + scrollX) * z`. This view is shared by the computer, tablet and recording; do not change it unexpectedly during a live take.
7. Save a named scene with `board_save`. Names accept letters, numbers, spaces, underscores and dashes, up to 80 characters. Saving an existing name replaces that saved scene; choose a new name when preserving a previous version. Use `board_list_scenes` and `board_load` to prepare a sequence of tutorial scenes.

Example `board_draw` arguments:

```json
{"elements":[
  {"id":"source-box","type":"rectangle","x":100,"y":150,"width":250,"height":130,"backgroundColor":"#d3f9d8","groupIds":["source"]},
  {"id":"source-label","type":"text","x":120,"y":195,"width":210,"height":40,"fontSize":28,"text":"Prepare an idea","groupIds":["source"]},
  {"id":"flow","type":"arrow","x":370,"y":215,"width":140,"height":0,"points":[[0,0],[140,0]]},
  {"id":"result-box","type":"ellipse","x":530,"y":150,"width":270,"height":130,"backgroundColor":"#d0ebff","groupIds":["result"]},
  {"id":"result-label","type":"text","x":575,"y":195,"width":190,"height":40,"fontSize":28,"text":"Explain clearly","groupIds":["result"]}
]}
```

Use `board_image` only for PNG/JPEG/WebP data URLs the user has authorized. Prefer shapes and text for editable diagrams. Do not put secrets into diagrams, links or image data. Do not clear the user's board or replace saved scenes without authorization. These tools cannot start a recording, read arbitrary local files, or control another application.

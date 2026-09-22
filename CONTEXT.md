# Reader Interaction Context

This glossary defines the project's terms for browser text selection and paginated reader input.

## Selection and navigation

**Text selection handle**:
A browser-provided control used to extend or contract a native text selection on touch devices.
_Avoid_: Cursor, reading cursor

**Mobile selection gesture**:
The complete touch interval from selecting or grabbing a text selection handle until touch end or cancellation, including moments when the browser temporarily reports a collapsed range.
_Avoid_: Text drag, page-turn gesture

**Selection navigation lock**:
The interaction state in which a native, pending, or settling text selection owns reader input and prevents paginated navigation.
_Avoid_: Selection mode, page lock

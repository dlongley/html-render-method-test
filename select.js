/*
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {parsePointer} from './pointer.js';

// this is the standard `selectJsonLd` algorithm from:
// https://www.w3.org/TR/vc-di-ecdsa/#selectjsonld
export function selectJsonLd({document, pointers} = {}) {
  if(!(document && typeof document === 'object')) {
    throw new TypeError('"document" must be an object.');
  }
  if(!Array.isArray(pointers)) {
    throw new TypeError('"pointers" must be an array.');
  }
  if(pointers.length === 0) {
    // no pointers, so nothing selected
    return null;
  }

  // track arrays to make them dense after selection
  const arrays = [];

  // perform selection
  const selectionDocument = {'@context': structuredClone(document['@context'])};
  _initSelection({selection: selectionDocument, source: document});
  for(const pointer of pointers) {
    // parse pointer into individual paths
    const paths = parsePointer(pointer);
    if(paths.length === 0) {
      // whole document selected
      return structuredClone(document);
    }
    _selectPaths({document, pointer, paths, selectionDocument, arrays});
  }

  // make any sparse arrays dense
  for(const array of arrays) {
    let i = 0;
    while(i < array.length) {
      if(array[i] === undefined) {
        array.splice(i, 1);
        continue;
      }
      i++;
    }
  }

  return selectionDocument;
}

function _selectPaths({
  document, pointer, paths, selectionDocument, arrays
} = {}) {
  // make pointer path in selection document
  let parentValue = document;
  let value = parentValue;
  let selectedParent = selectionDocument;
  let selectedValue = selectedParent;
  for(const path of paths) {
    selectedParent = selectedValue;
    parentValue = value;

    // get next document value
    value = parentValue[path];
    if(value === undefined) {
      throw new TypeError(
        `JSON pointer "${pointer}" does not match document.`);
    }

    // get next value selection
    selectedValue = selectedParent[path];
    if(selectedValue === undefined) {
      if(Array.isArray(value)) {
        selectedValue = [];
        arrays.push(selectedValue);
      } else {
        selectedValue = _initSelection({source: value});
      }
      selectedParent[path] = selectedValue;
    }
  }

  // path traversal complete, compute selected value
  if(typeof value !== 'object') {
    // literal selected
    selectedValue = value;
  } else if(Array.isArray(value)) {
    // full array selected
    selectedValue = structuredClone(value);
  } else {
    // object selected, blend with `id` / `type` / `@context`
    selectedValue = {...selectedValue, ...structuredClone(value)};
  }

  // add selected value to selected parent
  selectedParent[paths.at(-1)] = selectedValue;
}

function _initSelection({selection = {}, source}) {
  // must include non-blank node IDs
  if(source.id && !source.id.startsWith('_:')) {
    selection.id = source.id;
  }
  // always include types
  if(source.type) {
    selection.type = source.type;
  }
  return selection;
}

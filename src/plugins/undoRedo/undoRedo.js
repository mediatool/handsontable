/**
 * Handsontable UndoRedo class
 */
import Handsontable from './../../browser';
import {arrayMap} from './../../helpers/array';
import {rangeEach} from './../../helpers/number';
import {inherit, deepClone} from './../../helpers/object';
import {stopImmediatePropagation} from './../../helpers/dom/event';

/**
 * @description
 * Handsontable UndoRedo plugin. It allows to undo and redo certain actions done in the table.
 * Please note, that not all actions are currently undo-able.
 *
 * @example
 * ```js
 * ...
 * undo: true
 * ...
 * ```
 * @class UndoRedo
 * @plugin UndoRedo
 */
Handsontable.UndoRedo = function(instance, sourcesToIgnore) {
  let plugin = this;
  this.instance = instance;
  this.doneActions = [];
  this.undoneActions = [];
  this.ignoreNewActions = false;
  this.sourcesToIgnore = sourcesToIgnore;
  instance.addHook('afterChange', function(changes, origin) {
    const ignore = plugin.sourcesToIgnore.find((source) => origin === source);
    if (changes && ignore === undefined) {
      console.log('undoredo after change', changes, origin);
      let action = new Handsontable.UndoRedo.ChangeAction(changes);
      plugin.done(action);
    } else {
      console.log('undeoredo ignore!', origin);
    }
  });

  instance.addHook('afterCreateRow', function(index, amount, createdAutomatically) {

    console.log('undoredo after create row', createdAutomatically);
    if (createdAutomatically) {
      return;
    }

    let action = new Handsontable.UndoRedo.CreateRowAction(index, amount);
    plugin.done(action);
  });

  instance.addHook('beforeRemoveRow', function(index, amount) {
    console.log('undoredo beforeRemoveRow');
    let originalData = plugin.instance.getSourceData();
    index = (originalData.length + index) % originalData.length;
    let removedData = originalData.slice(index, index + amount);
    let action = new Handsontable.UndoRedo.RemoveRowAction(index, removedData);
    plugin.done(action);
  });

  instance.addHook('afterCreateCol', function(index, amount, createdAutomatically) {
    console.log('undoredo afterCreateCol', createdAutomatically);
    if (createdAutomatically) {
      return;
    }

    let action = new Handsontable.UndoRedo.CreateColumnAction(index, amount);
    plugin.done(action);
  });

  instance.addHook('beforeRemoveCol', function(index, amount) {
    let originalData = plugin.instance.getData();
    console.log('undoredo beforeRemoveCol');
    index = (plugin.instance.countCols() + index) % plugin.instance.countCols();
    let removedData = [];
    let headers = [];
    let indexes = [];

    rangeEach(0, originalData.length - 1, (i) => {
      removedData[i] = originalData[i].slice(index, index + amount);
    });

    rangeEach(0, amount - 1, (i) => {
      indexes.push(instance.runHooks('modifyCol', index + i));
    });

    if (Array.isArray(instance.getSettings().colHeaders)) {
      rangeEach(0, amount - 1, (i) => {
        headers.push(instance.getSettings().colHeaders[instance.runHooks('modifyCol', index + i)] || null);
      });
    }

    let manualColumnMovePlugin = plugin.instance.getPlugin('manualColumnMove');

    let action = new Handsontable.UndoRedo.RemoveColumnAction(indexes, removedData, headers, manualColumnMovePlugin ? manualColumnMovePlugin.columnPositions : []);

    plugin.done(action);
  });

  instance.addHook('beforeCellAlignment', function(stateBefore, range, type, alignment) {
    let action = new Handsontable.UndoRedo.CellAlignmentAction(stateBefore, range, type, alignment);
    plugin.done(action);
  });

  instance.addHook('beforeFilter', function(formulaStacks) {
    plugin.done(new Handsontable.UndoRedo.FiltersAction(formulaStacks));
  });

  instance.addHook('beforeRowMove', function(movedRows, target) {
    console.log('undoredo beforeRowMove');
    plugin.done(new Handsontable.UndoRedo.RowMoveAction(movedRows, target));
  });
};

Handsontable.UndoRedo.prototype.done = function(action) {
  if (!this.ignoreNewActions) {
    this.doneActions.push(action);
    this.undoneActions.length = 0;
  }
};

/**
 * Undo last edit.
 *
 * @function undo
 * @memberof UndoRedo#
 */
Handsontable.UndoRedo.prototype.undo = function() {
  if (this.isUndoAvailable()) {
    let action = this.doneActions.pop();
    let actionClone = deepClone(action);
    let instance = this.instance;

    let continueAction = instance.runHooks('beforeUndo', actionClone);

    if (continueAction === false) {
      return;
    }

    this.ignoreNewActions = true;
    let that = this;
    action.undo(this.instance, function() {
      that.ignoreNewActions = false;
      that.undoneActions.push(action);
    });

    instance.runHooks('afterUndo', actionClone);
  }
};

/**
 * Redo edit (used to reverse an undo).
 *
 * @function redo
 * @memberof UndoRedo#
 */
Handsontable.UndoRedo.prototype.redo = function() {
  if (this.isRedoAvailable()) {
    let action = this.undoneActions.pop();
    let actionClone = deepClone(action);
    let instance = this.instance;

    let continueAction = instance.runHooks('beforeRedo', actionClone);

    if (continueAction === false) {
      return;
    }

    this.ignoreNewActions = true;
    let that = this;
    action.redo(this.instance, function() {
      that.ignoreNewActions = false;
      that.doneActions.push(action);
    });

    instance.runHooks('afterRedo', actionClone);
  }
};

/**
 * Check if undo action is available.
 *
 * @function isUndoAvailable
 * @memberof UndoRedo#
 * @return {Boolean} Return `true` if undo can be performed, `false` otherwise
 */
Handsontable.UndoRedo.prototype.isUndoAvailable = function() {
  return this.doneActions.length > 0;
};

/**
 * Check if redo action is available.
 *
 * @function isRedoAvailable
 * @memberof UndoRedo#
 * @return {Boolean} Return `true` if redo can be performed, `false` otherwise.
 */
Handsontable.UndoRedo.prototype.isRedoAvailable = function() {
  return this.undoneActions.length > 0;
};

/**
 * Clears undo history.
 *
 * @function clear
 * @memberof UndoRedo#
 */
Handsontable.UndoRedo.prototype.clear = function() {
  this.doneActions.length = 0;
  this.undoneActions.length = 0;
};

Handsontable.UndoRedo.Action = function() {};
Handsontable.UndoRedo.Action.prototype.undo = function() {};
Handsontable.UndoRedo.Action.prototype.redo = function() {};

/**
 * Change action.
 */
Handsontable.UndoRedo.ChangeAction = function(changes) {
  this.changes = changes;
  this.actionType = 'change';
};
inherit(Handsontable.UndoRedo.ChangeAction, Handsontable.UndoRedo.Action);

Handsontable.UndoRedo.ChangeAction.prototype.undo = function(instance, undoneCallback) {
  let data = deepClone(this.changes),
    emptyRowsAtTheEnd = instance.countEmptyRows(true),
    emptyColsAtTheEnd = instance.countEmptyCols(true);

  for (let i = 0, len = data.length; i < len; i++) {
    data[i].splice(3, 1);
  }

  instance.addHookOnce('afterChange', undoneCallback);

  instance.setDataAtRowProp(data, null, null, 'undo');

  for (let i = 0, len = data.length; i < len; i++) {
    if (instance.getSettings().minSpareRows && data[i][0] + 1 + instance.getSettings().minSpareRows === instance.countRows() && emptyRowsAtTheEnd == instance.getSettings().minSpareRows) {

      instance.alter('remove_row', parseInt(data[i][0] + 1, 10), instance.getSettings().minSpareRows);
      instance.undoRedo.doneActions.pop();

    }

    if (instance.getSettings().minSpareCols && data[i][1] + 1 + instance.getSettings().minSpareCols === instance.countCols() && emptyColsAtTheEnd == instance.getSettings().minSpareCols) {

      instance.alter('remove_col', parseInt(data[i][1] + 1, 10), instance.getSettings().minSpareCols);
      instance.undoRedo.doneActions.pop();
    }
  }

};
Handsontable.UndoRedo.ChangeAction.prototype.redo = function(instance, onFinishCallback) {
  let data = deepClone(this.changes);

  for (let i = 0, len = data.length; i < len; i++) {
    data[i].splice(2, 1);
  }

  instance.addHookOnce('afterChange', onFinishCallback);

  instance.setDataAtRowProp(data, null, null, 'redo');

};

/**
 * Create row action.
 */
Handsontable.UndoRedo.CreateRowAction = function(index, amount) {
  this.index = index;
  this.amount = amount;
  this.actionType = 'insert_row';
};
inherit(Handsontable.UndoRedo.CreateRowAction, Handsontable.UndoRedo.Action);

Handsontable.UndoRedo.CreateRowAction.prototype.undo = function(instance, undoneCallback) {
  let rowCount = instance.countRows(),
    minSpareRows = instance.getSettings().minSpareRows;
  if (this.index >= rowCount && this.index - minSpareRows < rowCount) {
    this.index -= minSpareRows; // work around the situation where the needed row was removed due to an 'undo' of a made change
  }

  instance.addHookOnce('afterRemoveRow', undoneCallback);
  instance.alter('remove_row', this.index, this.amount);
};
Handsontable.UndoRedo.CreateRowAction.prototype.redo = function(instance, redoneCallback) {
  instance.addHookOnce('afterCreateRow', redoneCallback);
  instance.alter('insert_row', this.index + 1, this.amount);
};

/**
 * Remove row action.
 */
Handsontable.UndoRedo.RemoveRowAction = function(index, data) {
  this.index = index;
  this.data = data;
  this.actionType = 'remove_row';
};
inherit(Handsontable.UndoRedo.RemoveRowAction, Handsontable.UndoRedo.Action);

Handsontable.UndoRedo.RemoveRowAction.prototype.undo = function(instance, undoneCallback) {
  let spliceArgs = [this.index, 0];
  Array.prototype.push.apply(spliceArgs, this.data);

  Array.prototype.splice.apply(instance.getSourceData(), spliceArgs);

  instance.runHooks('afterCreateRow', this.index, this.data.length, true);

  instance.addHookOnce('afterRender', undoneCallback);
  instance.render();
};
Handsontable.UndoRedo.RemoveRowAction.prototype.redo = function(instance, redoneCallback) {
  instance.addHookOnce('afterRemoveRow', redoneCallback);
  instance.alter('remove_row', this.index, this.data.length);
};

/**
 * Create column action.
 */
Handsontable.UndoRedo.CreateColumnAction = function(index, amount) {
  this.index = index;
  this.amount = amount;
  this.actionType = 'insert_col';
};
inherit(Handsontable.UndoRedo.CreateColumnAction, Handsontable.UndoRedo.Action);

Handsontable.UndoRedo.CreateColumnAction.prototype.undo = function(instance, undoneCallback) {
  instance.addHookOnce('afterRemoveCol', undoneCallback);
  instance.alter('remove_col', this.index, this.amount);
};
Handsontable.UndoRedo.CreateColumnAction.prototype.redo = function(instance, redoneCallback) {
  instance.addHookOnce('afterCreateCol', redoneCallback);
  instance.alter('insert_col', this.index + 1, this.amount);
};

/**
 * Cell alignment action.
 */
Handsontable.UndoRedo.CellAlignmentAction = function(stateBefore, range, type, alignment) {
  this.stateBefore = stateBefore;
  this.range = range;
  this.type = type;
  this.alignment = alignment;
  this.actionType = 'cell_alignment';
};
Handsontable.UndoRedo.CellAlignmentAction.prototype.undo = function(instance, undoneCallback) {
  if (!instance.getPlugin('contextMenu').isEnabled()) {
    return;
  }
  for (let row = this.range.from.row; row <= this.range.to.row; row++) {
    for (let col = this.range.from.col; col <= this.range.to.col; col++) {
      instance.setCellMeta(row, col, 'className', this.stateBefore[row][col] || ' htLeft');
    }
  }

  instance.addHookOnce('afterRender', undoneCallback);
  instance.render();
};
Handsontable.UndoRedo.CellAlignmentAction.prototype.redo = function(instance, undoneCallback) {
  if (!instance.getPlugin('contextMenu').isEnabled()) {
    return;
  }
  instance.selectCell(this.range.from.row, this.range.from.col, this.range.to.row, this.range.to.col);
  instance.getPlugin('contextMenu').executeCommand('alignment:' + this.alignment.replace('ht', '').toLowerCase());

  instance.addHookOnce('afterRender', undoneCallback);
  instance.render();
};

/**
 * Remove column action.
 */
Handsontable.UndoRedo.RemoveColumnAction = function(indexes, data, headers, columnPositions) {
  this.indexes = indexes;
  this.data = data;
  this.amount = this.data[0].length;
  this.headers = headers;
  this.columnPositions = columnPositions.slice(0);
  this.actionType = 'remove_col';
};
inherit(Handsontable.UndoRedo.RemoveColumnAction, Handsontable.UndoRedo.Action);

Handsontable.UndoRedo.RemoveColumnAction.prototype.undo = function(instance, undoneCallback) {
  let row;
  let ascendingIndexes = this.indexes.slice(0).sort();
  let sortByIndexes = (elem, j, arr) => {
    return arr[this.indexes.indexOf(ascendingIndexes[j])];
  };

  let sortedData = [];
  rangeEach(0, this.data.length - 1, (i) => {
    sortedData[i] = arrayMap(this.data[i], sortByIndexes);
  });

  let sortedHeaders = [];
  sortedHeaders = arrayMap(this.headers, sortByIndexes);

  rangeEach(0, this.data.length - 1, (i) => {
    row = instance.getSourceDataAtRow(i);

    rangeEach(0, ascendingIndexes.length - 1, (j) => {
      row.splice(ascendingIndexes[j], 0, sortedData[i][j]);
    });
  });

  if (typeof this.headers != 'undefined') {
    rangeEach(0, sortedHeaders.length - 1, (j) => {
      instance.getSettings().colHeaders.splice(ascendingIndexes[j], 0, sortedHeaders[j]);
    });
  }

  if (instance.getPlugin('manualColumnMove')) {
    instance.getPlugin('manualColumnMove').columnPositions = this.columnPositions;
  }

  instance.addHookOnce('afterRender', undoneCallback);
  instance.render();
};

Handsontable.UndoRedo.RemoveColumnAction.prototype.redo = function(instance, redoneCallback) {
  instance.addHookOnce('afterRemoveCol', redoneCallback);
  instance.alter('remove_col', instance.runHooks('unmodifyCol', this.indexes[0]), this.amount);
};

/**
 * Filters action.
 */
Handsontable.UndoRedo.FiltersAction = function(formulaStacks) {
  this.formulaStacks = formulaStacks;
  this.actionType = 'filter';
};
inherit(Handsontable.UndoRedo.FiltersAction, Handsontable.UndoRedo.Action);

Handsontable.UndoRedo.FiltersAction.prototype.undo = function(instance, undoneCallback) {
  let filters = instance.getPlugin('filters');

  instance.addHookOnce('afterRender', undoneCallback);

  filters.formulaCollection.importAllFormulas(this.formulaStacks.slice(0, this.formulaStacks.length - 1));
  filters.filter();
};
Handsontable.UndoRedo.FiltersAction.prototype.redo = function(instance, redoneCallback) {
  let filters = instance.getPlugin('filters');

  instance.addHookOnce('afterRender', redoneCallback);

  filters.formulaCollection.importAllFormulas(this.formulaStacks);
  filters.filter();
};

/**
 * ManualRowMove action.
 * @TODO: removeRow undo should works on logical index
 */
Handsontable.UndoRedo.RowMoveAction = function(movedRows, target) {
  this.rows = movedRows.slice();
  this.target = target;
};
inherit(Handsontable.UndoRedo.RowMoveAction, Handsontable.UndoRedo.Action);

Handsontable.UndoRedo.RowMoveAction.prototype.undo = function(instance, undoneCallback) {
  let manualRowMove = instance.getPlugin('manualRowMove');

  instance.addHookOnce('afterRender', undoneCallback);
  let mod = this.rows[0] < this.target ? -1 * this.rows.length : 0;
  let newTarget = this.rows[0] > this.target ? this.rows[0] + this.rows.length : this.rows[0];
  let newRows = [];
  let rowsLen = this.rows.length + mod;

  for (let i = mod; i < rowsLen; i++) {
    newRows.push(this.target + i);
  }
  manualRowMove.moveRows(newRows.slice(), newTarget);
  instance.render();

  instance.selection.setRangeStartOnly(new WalkontableCellCoords(this.rows[0], 0));
  instance.selection.setRangeEnd(new WalkontableCellCoords(this.rows[this.rows.length - 1], instance.countCols() - 1));
};
Handsontable.UndoRedo.RowMoveAction.prototype.redo = function(instance, redoneCallback) {
  let manualRowMove = instance.getPlugin('manualRowMove');

  instance.addHookOnce('afterRender', redoneCallback);
  manualRowMove.moveRows(this.rows.slice(), this.target);
  instance.render();
  let startSelection = this.rows[0] < this.target ? this.target - this.rows.length : this.target;
  instance.selection.setRangeStartOnly(new WalkontableCellCoords(startSelection, 0));
  instance.selection.setRangeEnd(new WalkontableCellCoords(startSelection + this.rows.length - 1, instance.countCols() - 1));
};

function init() {
  let instance = this;
  let pluginEnabled = typeof instance.getSettings().undo == 'undefined' || instance.getSettings().undo;
  const sourcesToIgnore = instance.getSettings().undoIgnoreSources;

  if (pluginEnabled) {
    if (!instance.undoRedo) {
      /**
       * Instance of Handsontable.UndoRedo Plugin {@link Handsontable.UndoRedo}
       *
       * @alias undoRedo
       * @memberof! Handsontable.Core#
       * @type {UndoRedo}
       */
      instance.undoRedo = new Handsontable.UndoRedo(instance, sourcesToIgnore || []);

      exposeUndoRedoMethods(instance);

      instance.addHook('beforeKeyDown', onBeforeKeyDown);
      instance.addHook('afterChange', onAfterChange);
    }
  } else {
    if (instance.undoRedo) {
      delete instance.undoRedo;

      removeExposedUndoRedoMethods(instance);

      instance.removeHook('beforeKeyDown', onBeforeKeyDown);
      instance.removeHook('afterChange', onAfterChange);
    }
  }
}

function onBeforeKeyDown(event) {
  let instance = this;

  let ctrlDown = (event.ctrlKey || event.metaKey) && !event.altKey;

  if (ctrlDown) {
    if (event.keyCode === 89 || (event.shiftKey && event.keyCode === 90)) { //CTRL + Y or CTRL + SHIFT + Z
      instance.undoRedo.redo();
      stopImmediatePropagation(event);
    } else if (event.keyCode === 90) { // CTRL + Z
      instance.undoRedo.undo();
      stopImmediatePropagation(event);
    }
  }
}

function onAfterChange(changes, source) {
  let instance = this;
  if (source == 'loadData') {
    return instance.undoRedo.clear();
  }
}

function exposeUndoRedoMethods(instance) {
  /**
   * {@link UndoRedo#undo}
   * @alias undo
   * @memberof! Handsontable.Core#
   */
  instance.undo = function() {
    return instance.undoRedo.undo();
  };

  /**
   * {@link UndoRedo#redo}
   * @alias redo
   * @memberof! Handsontable.Core#
   */
  instance.redo = function() {
    return instance.undoRedo.redo();
  };

  /**
   * {@link UndoRedo#isUndoAvailable}
   * @alias isUndoAvailable
   * @memberof! Handsontable.Core#
   */
  instance.isUndoAvailable = function() {
    return instance.undoRedo.isUndoAvailable();
  };

  /**
   * {@link UndoRedo#isRedoAvailable}
   * @alias isRedoAvailable
   * @memberof! Handsontable.Core#
   */
  instance.isRedoAvailable = function() {
    return instance.undoRedo.isRedoAvailable();
  };

  /**
   * {@link UndoRedo#clear}
   * @alias clearUndo
   * @memberof! Handsontable.Core#
   */
  instance.clearUndo = function() {
    return instance.undoRedo.clear();
  };
}

function removeExposedUndoRedoMethods(instance) {
  delete instance.undo;
  delete instance.redo;
  delete instance.isUndoAvailable;
  delete instance.isRedoAvailable;
  delete instance.clearUndo;
}

Handsontable.hooks.add('afterInit', init);
Handsontable.hooks.add('afterUpdateSettings', init);

Handsontable.hooks.register('beforeUndo');
Handsontable.hooks.register('afterUndo');
Handsontable.hooks.register('beforeRedo');
Handsontable.hooks.register('afterRedo');

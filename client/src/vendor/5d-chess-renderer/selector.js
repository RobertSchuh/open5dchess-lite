import * as utilsFuncs from './utils.js';
class Selector {
  //Used to select pieces and moves
  constructor(global) {
    this.global = global;
    this.emitter = this.global.emitter;

    this.emitter.on('pieceTap', (data) => {
      if(this.global.selectedPiece !== null && this.global.selectedPiece.key === data.key) {
        this.global.selectedPiece = null;
      }
      else {
        this.global.selectedPiece = {
          key: data.key,
          squareKey: data.squareKey,
          pieceObject: data.pieceObject,
        };
      }
      this.global.emitter.emit('selectedPieceUpdate');
    });
    this.emitter.on('highlightTap', (data) => {
      if(this.global.selectedPiece !== null && this.global.selectedPiece.squareKey === data.key) {
        this.global.selectedPiece = null;
        this.global.emitter.emit('selectedPieceUpdate');
      }
    });
    this.emitter.on('pieceOver', (data) => {
      this.global.hoverPiece = {
        key: data.key,
        squareKey: data.squareKey,
        pieceObject: data.pieceObject,
      };
      this.global.emitter.emit('hoverPieceUpdate');
    });
    this.emitter.on('pieceOut', (data) => {
      if(this.global.hoverPiece !== null && this.global.hoverPiece.key === data.key) {
        this.global.hoverPiece = null;
        this.global.emitter.emit('hoverPieceUpdate');
      }
    });
    this.emitter.on('moveSelect', () => {
      if(this.global.configStore.get('selector').deselectOnMove) {
        if(this.global.selectedPiece !== null) {
          this.global.selectedPiece = null;
          this.global.emitter.emit('selectedPieceUpdate');
        }
        if(this.global.hoverPiece !== null) {
          this.global.hoverPiece = null;
          this.global.emitter.emit('hoverPieceUpdate');
        }
      }
    });
    //Checking board that hover and selected pieces still exist
    this.emitter.on('boardUpdate', () => {
      var deleteHoverPiece = true;
      var deleteSelectedPiece = true;
      var currentTimelines = this.global.boardObject.timelines;
      for(var l = 0;currentTimelines && l < currentTimelines.length;l++) {
        var currentTurns = currentTimelines[l].turns;
        for(var t = 0;currentTurns && t < currentTurns.length;t++) {
          var currentPieces = currentTurns[t].pieces;
          for(var p = 0;currentPieces && p < currentPieces.length;p++) {
            var currentPiece = currentPieces[p];
            if(this.global.hoverPiece !== null) {
              if(utilsFuncs.pieceObjectKey(currentPiece) === this.global.hoverPiece.key) {
                deleteHoverPiece = false;
              }
            }
            if(this.global.selectedPiece !== null) {
              if(utilsFuncs.pieceObjectKey(currentPiece) === this.global.selectedPiece.key) {
                deleteSelectedPiece = false;
              }
            }
          }
        }
      }
      if(deleteHoverPiece && this.global.hoverPiece !== null) {
        this.global.hoverPiece = null;
        this.global.emitter.emit('hoverPieceUpdate');
      }
      if(deleteSelectedPiece && this.global.selectedPiece !== null) {
        this.global.selectedPiece = null;
        this.global.emitter.emit('selectedPieceUpdate');
      }
    });

    //TODO: Single highlight for 'cursor'
    //TODO: Add methods to easily bind to keyboard / controller inputs
  }
  selectPiece(pieceObject) {
    this.global.selectedPiece = {
      key: utilsFuncs.pieceObjectKey(pieceObject),
      squareKey: utilsFuncs.squareObjectKey(pieceObject.position),
      pieceObject: pieceObject,
    };
    this.global.emitter.emit('selectedPieceUpdate');
  }
  deselectPiece() {
    this.global.selectedPiece = null;
    this.global.emitter.emit('selectedPieceUpdate');
  }
  hoverPiece(pieceObject) {
    this.global.hoverPiece = {
      key: utilsFuncs.pieceObjectKey(pieceObject),
      squareKey: utilsFuncs.squareObjectKey(pieceObject.position),
      pieceObject: pieceObject,
    };
    this.global.emitter.emit('hoverPieceUpdate');
  }
  unhoverPiece() {
    this.global.hoverPiece = null;
    this.global.emitter.emit('hoverPieceUpdate');
  }
}

export default Selector;
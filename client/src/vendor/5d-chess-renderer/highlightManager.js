import Highlight from './highlight.js';
import * as utilsFuncs from './utils.js';
class HighlightManager {
  constructor(global) {
    this.global = global;
    this.emitter = this.global.emitter;

    this.selectedPieceHighlight;
    this.selectedPieceMoveHighlights = [];
    this.selectedPiecePastMoveHighlights = [];

    this.hoverPieceHighlight;
    this.hoverPieceMoveHighlights = [];
    this.hoverPiecePastMoveHighlights = [];

    //Pieces that have a legal move (open5dchess legal move hints)
    this.legalPieceHighlights = [];

    this.emitter.on('selectedPieceUpdate', this.update.bind(this));
    this.emitter.on('hoverPieceUpdate', this.update.bind(this));
    this.emitter.on('configUpdate', this.update.bind(this));
    this.emitter.on('paletteUpdate', this.update.bind(this));
    this.emitter.on('legalPiecesUpdate', this.update.bind(this));
    this.emitter.on('boardUpdate', this.update.bind(this));
  }
  updateLegalPieces() {
    //Skip the selected piece, it already has its own highlight
    var selectedKey = this.global.selectedPiece !== null ? this.global.selectedPiece.squareKey : null;
    var squares = this.global.legalPieceObjects.filter((s) => {
      return utilsFuncs.squareObjectKey(s) !== selectedKey;
    });
    //Destroy extra highlights
    for(var i = squares.length;i < this.legalPieceHighlights.length;i++) {
      this.legalPieceHighlights[i].destroy();
      this.legalPieceHighlights.splice(i,1);
      i--;
    }
    for(var i = 0;i < squares.length;i++) { // eslint-disable-line no-redeclare
      var highlight = Object.assign({}, squares[i]);
      highlight.alpha = this.global.configStore.get('highlight').legalPieceAlpha;
      highlight.color = this.global.paletteStore.get('highlight').legalPiece;
      if(typeof this.legalPieceHighlights[i] !== 'undefined') {
        this.legalPieceHighlights[i].update(highlight);
      }
      else {
        this.legalPieceHighlights[i] = new Highlight(this.global, highlight);
      }
    }
  }
  update() {
    this.updateLegalPieces();
    //Updating selectedPiece (and moves)
    if(
      this.global.selectedPiece !== null &&
      (this.global.selectedPiece.pieceObject.position.player === 'white' && this.global.configStore.get('board').showWhite ||
      this.global.selectedPiece.pieceObject.position.player === 'black' && this.global.configStore.get('board').showBlack)
    ) {
      var highlight = this.global.selectedPiece.pieceObject.position;
      highlight.alpha = this.global.configStore.get('highlight').selectedAlpha;
      highlight.color = this.global.paletteStore.get('highlight').self;
      if(typeof this.selectedPieceHighlight !== 'undefined') {
        this.selectedPieceHighlight.update(highlight);
      }
      else {
        this.selectedPieceHighlight = new Highlight(this.global, highlight);
      }

      //Currently available moves with the same start as selected piece
      var moves = this.global.availableMoveObjects.filter((m) => {
        return utilsFuncs.squareObjectKey(m.start) === this.global.selectedPiece.squareKey;
      });
      
      //Destroy extra highlights
      for(var i = moves.length;i < this.selectedPieceMoveHighlights.length;i++) {
        this.selectedPieceMoveHighlights[i].destroy();
        this.selectedPieceMoveHighlights.splice(i,1);
        i--;
      }
      for(var i = 0;i < moves.length;i++) {
        var highlight = moves[i].end;
        highlight.alpha = this.global.configStore.get('highlight').selectedAlpha;
        highlight.color = this.global.paletteStore.get('highlight').move;
        if(utilsFuncs.isCapturingMove(this.global.boardObject, moves[i])) {
          highlight.color = this.global.paletteStore.get('highlight').capture;
        }
        highlight.interactive = true;
        highlight.move = moves[i];
        if(typeof this.selectedPieceMoveHighlights[i] !== 'undefined') {
          this.selectedPieceMoveHighlights[i].update(highlight);
        }
        else {
          this.selectedPieceMoveHighlights[i] = new Highlight(this.global, highlight);
        }
      }
      
      //Past available moves with the same start as selected piece
      moves = this.global.pastAvailableMoveObjects.filter((m) => {
        return utilsFuncs.squareObjectKey(m.start) === this.global.selectedPiece.squareKey;
      });
      
      //Destroy extra highlights
      for(var i = moves.length;i < this.selectedPiecePastMoveHighlights.length;i++) {
        this.selectedPiecePastMoveHighlights[i].destroy();
        this.selectedPiecePastMoveHighlights.splice(i,1);
        i--;
      }
      for(var i = 0;i < moves.length;i++) {
        var highlight = moves[i].end;
        highlight.alpha = this.global.configStore.get('highlight').pastSelectedAlpha;
        highlight.color = this.global.paletteStore.get('highlight').pastMove;
        if(utilsFuncs.isCapturingMove(this.global.boardObject, moves[i])) {
          highlight.color = this.global.paletteStore.get('highlight').pastCapture;
        }
        if(typeof this.selectedPiecePastMoveHighlights[i] !== 'undefined') {
          this.selectedPiecePastMoveHighlights[i].update(highlight);
        }
        else {
          this.selectedPiecePastMoveHighlights[i] = new Highlight(this.global, highlight);
        }
      }
    }
    else {
      if(typeof this.selectedPieceHighlight !== 'undefined') {
        this.selectedPieceHighlight.destroy();
        this.selectedPieceHighlight = undefined;
      }
      for(var i = 0;i < this.selectedPieceMoveHighlights.length;i++) {
        this.selectedPieceMoveHighlights[i].destroy();
        this.selectedPieceMoveHighlights.splice(i,1);
        i--;
      }
      for(var i = 0;i < this.selectedPiecePastMoveHighlights.length;i++) {
        this.selectedPiecePastMoveHighlights[i].destroy();
        this.selectedPiecePastMoveHighlights.splice(i,1);
        i--;
      }
    }

    //Updating hoverPiece (and moves)
    //Only show if hover piece is different from selected piece
    if(
      this.global.hoverPiece !== null &&
      (
        this.global.hoverPiece.pieceObject.position.player === 'white' && this.global.configStore.get('board').showWhite ||
        this.global.hoverPiece.pieceObject.position.player === 'black' && this.global.configStore.get('board').showBlack
      ) &&
      (this.global.selectedPiece === null || this.global.hoverPiece.key !== this.global.selectedPiece.key)
    ) {
      var highlight = this.global.hoverPiece.pieceObject.position;
      highlight.alpha = this.global.configStore.get('highlight').hoverAlpha;
      highlight.color = this.global.paletteStore.get('highlight').self;
      if(typeof this.hoverPieceHighlight !== 'undefined') {
        this.hoverPieceHighlight.update(highlight);
      }
      else {
        this.hoverPieceHighlight = new Highlight(this.global, highlight);
      }
      
      //Currently available moves with the same start as selected piece
      var moves = this.global.availableMoveObjects.filter((m) => {
        return utilsFuncs.squareObjectKey(m.start) === this.global.hoverPiece.squareKey;
      });
      
      //Destroy extra highlights
      for(var i = moves.length;i < this.hoverPieceMoveHighlights.length;i++) {
        this.hoverPieceMoveHighlights[i].destroy();
        this.hoverPieceMoveHighlights.splice(i,1);
        i--;
      }
      for(var i = 0;i < moves.length;i++) {
        var highlight = moves[i].end;
        highlight.alpha = this.global.configStore.get('highlight').hoverAlpha;
        highlight.color = this.global.paletteStore.get('highlight').move;
        if(utilsFuncs.isCapturingMove(this.global.boardObject, moves[i])) {
          highlight.color = this.global.paletteStore.get('highlight').capture;
        }
        highlight.interactive = true;
        highlight.move = moves[i];
        if(typeof this.hoverPieceMoveHighlights[i] !== 'undefined') {
          this.hoverPieceMoveHighlights[i].update(highlight);
        }
        else {
          this.hoverPieceMoveHighlights[i] = new Highlight(this.global, highlight);
        }
      }
      
      //Past available moves with the same start as selected piece
      moves = this.global.pastAvailableMoveObjects.filter((m) => {
        return utilsFuncs.squareObjectKey(m.start) === this.global.hoverPiece.squareKey;
      });
      
      //Destroy extra highlights
      for(var i = moves.length;i < this.hoverPiecePastMoveHighlights.length;i++) {
        this.hoverPiecePastMoveHighlights[i].destroy();
        this.hoverPiecePastMoveHighlights.splice(i,1);
        i--;
      }
      for(var i = 0;i < moves.length;i++) {
        var highlight = moves[i].end;
        highlight.alpha = this.global.configStore.get('highlight').pastHoverAlpha;
        highlight.color = this.global.paletteStore.get('highlight').pastMove;
        if(utilsFuncs.isCapturingMove(this.global.boardObject, moves[i])) {
          highlight.color = this.global.paletteStore.get('highlight').pastCapture;
        }
        if(typeof this.hoverPiecePastMoveHighlights[i] !== 'undefined') {
          this.hoverPiecePastMoveHighlights[i].update(highlight);
        }
        else {
          this.hoverPiecePastMoveHighlights[i] = new Highlight(this.global, highlight);
        }
      }
    }
    else {
      if(typeof this.hoverPieceHighlight !== 'undefined') {
        this.hoverPieceHighlight.destroy();
        this.hoverPieceHighlight = undefined;
      }
      for(var i = 0;i < this.hoverPieceMoveHighlights.length;i++) {
        this.hoverPieceMoveHighlights[i].destroy();
        this.hoverPieceMoveHighlights.splice(i,1);
        i--;
      }
      for(var i = 0;i < this.hoverPiecePastMoveHighlights.length;i++) {
        this.hoverPiecePastMoveHighlights[i].destroy();
        this.hoverPiecePastMoveHighlights.splice(i,1);
        i--;
      }
    }
  }
}

export default HighlightManager;
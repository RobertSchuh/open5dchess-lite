import * as utilsFuncs from './utils.js';
import * as positionFuncs from './position.js';
import Label from './label.js';
class BoardLabel {
    constructor(global, turnObject = null, layer = null) {
        this.global = global;
        this.emitter = this.global.emitter;
        this.layer = this.global.layers.layers.labels;
        if (layer !== null) {
            this.layer = layer;
        }

        this.timelineLabelL;
        this.timelineLabelR;
        this.turnLabel;
        this.fileLabels = [];
        this.rankLabels = [];
        if (turnObject !== null) {
            this.update(turnObject);
        }
    }
    refresh() {
        this.update(this.turnObject);
    }
    update(turnObject) {
        //Assign pieceObj to instance variables
        this.turnObject = turnObject;

        var coordinates = positionFuncs.toCoordinates({
            timeline: this.turnObject.timeline,
            turn: this.turnObject.turn,
            player: this.turnObject.player,
            coordinate: 'a1',
            rank: 1,
            file: 1
        }, this.global);
        //Load and animate board labels
        this.coordinates = coordinates;
        this.showTimeline = this.global.configStore.get('boardLabel').showTimeline;
        this.showTurn = this.global.configStore.get('boardLabel').showTurn;
        this.showFile = this.global.configStore.get('boardLabel').showFile;
        this.showRank = this.global.configStore.get('boardLabel').showRank;
        this.showMiddleTimeline = this.global.configStore.get('boardLabel').showMiddleTimeline;

        //Calulate if is middle turn
        var showL = false;
        var showR = false;
        try {
            var currTimeline = this.global.boardObject.timelines.filter(t => t.timeline === this.turnObject.timeline)[0];
            var minTurn = Number.POSITIVE_INFINITY;
            var minPlayer = 'black';
            var maxTurn = Number.NEGATIVE_INFINITY;
            var maxPlayer = 'white';
            for (var i = 0; i < currTimeline.turns.length; i++) {
                if (
                    (currTimeline.turns[i].player === 'white' && this.global.configStore.get('board').showWhite) ||
                    (currTimeline.turns[i].player === 'black' && this.global.configStore.get('board').showBlack)
                ) {
                    if (!currTimeline.turns[i].ghost || this.global.configStore.get('board').showGhost) {
                        if (minTurn > currTimeline.turns[i].turn) {
                            minTurn = currTimeline.turns[i].turn;
                            minPlayer = currTimeline.turns[i].player;
                        }
                        if (
                            minTurn === currTimeline.turns[i].turn &&
                            minPlayer === 'black' &&
                            currTimeline.turns[i].player === 'white'
                        ) {
                            minTurn = currTimeline.turns[i].turn;
                            minPlayer = currTimeline.turns[i].player;
                        }
                        if (maxTurn < currTimeline.turns[i].turn) {
                            maxTurn = currTimeline.turns[i].turn;
                            maxPlayer = currTimeline.turns[i].player;
                        }
                        if (
                            maxTurn === currTimeline.turns[i].turn &&
                            maxPlayer === 'white' &&
                            currTimeline.turns[i].player === 'black'
                        ) {
                            maxTurn = currTimeline.turns[i].turn;
                            maxPlayer = currTimeline.turns[i].player;
                        }
                    }
                }
            }
            if (this.turnObject.turn === minTurn && this.turnObject.player === minPlayer) {
                showL = true;
            }
            if (this.turnObject.turn === maxTurn && this.turnObject.player === maxPlayer) {
                showR = true;
            }
        }
        catch (err) { }
        if (this.showMiddleTimeline) { showL = true; }

        //Create or update timeline / turn label
        var labelObject = {
            timeline: this.turnObject.timeline,
            turn: this.turnObject.turn,
            player: this.turnObject.player,
            coordinate: 'a1',
            rank: 1,
            file: 1,
            check: this.turnObject.check,
            active: this.turnObject.active,
        };
        labelObject.type = 'timelineL';
        if (typeof this.timelineLabelL !== 'undefined') {
            if (!this.showTimeline || !showL) {
                this.timelineLabelL.destroy();
                this.timelineLabelL = undefined;
            }
            else {
                this.timelineLabelL.update(labelObject);
            }
        }
        else if (this.showTimeline && showL) {
            this.timelineLabelL = new Label(this.global, labelObject, this.layer);
        }
        labelObject.type = 'timelineR';
        if (typeof this.timelineLabelR !== 'undefined') {
            if (!this.showTimeline || !showR) {
                this.timelineLabelR.destroy();
                this.timelineLabelR = undefined;
            }
            else {
                this.timelineLabelR.update(labelObject);
            }
        }
        else if (this.showTimeline && showR) {
            this.timelineLabelR = new Label(this.global, labelObject, this.layer);
        }
        labelObject.type = 'turn';
        if (typeof this.turnLabel !== 'undefined') {
            if (!this.showTurn) {
                this.turnLabel.destroy();
                this.turnLabel = undefined;
            }
            else {
                this.turnLabel.update(labelObject);
            }
        }
        else if (this.showTurn) {
            this.turnLabel = new Label(this.global, labelObject, this.layer);
        }

        //Creating new file array
        var files = [];
        for (var f = 0; f < this.global.boardObject.width; f++) {
            var rank = 1;
            var file = f + 1;
            var coordinates = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'][f] + rank;
            var labelObject = {
                type: 'file',
                timeline: this.turnObject.timeline,
                turn: this.turnObject.turn,
                player: this.turnObject.player,
                coordinate: coordinates,
                rank: rank,
                file: file,
                check: this.turnObject.check,
                active: this.turnObject.active,
            };
            var key = utilsFuncs.squareObjectKey(labelObject);
            files.push({
                key: key,
                labelObject: labelObject
            });
        }
        if (!this.showFile) { files = []; }
        //Looking in internal file object to see if they still exist
        for (var i = 0; i < this.fileLabels.length; i++) {
            var found = false;
            for (var j = 0; j < files.length; j++) {
                if (this.fileLabels[i].key === files[j].key) {
                    found = true;
                    this.fileLabels[i].update(files[j].labelObject);
                }
            }
            if (!found) {
                this.fileLabels[i].destroy();
                this.fileLabels.splice(i, 1);
                i--;
            }
        }
        //Looking in new file array for new file to create
        for (var j = 0; j < files.length; j++) {
            for (var i = 0; i < this.fileLabels.length; i++) {
                if (this.fileLabels[i].key === files[j].key) {
                    found = true;
                }
            }
            if (!found) {
                this.fileLabels.push(new Label(this.global, files[j].labelObject, this.layer));
            }
        }

        //Creating new rank array
        var ranks = [];
        for (var r = 0; r < this.global.boardObject.height; r++) {
            var rank = r + 1;
            var file = 1;
            var coordinates = 'a' + rank;
            var labelObject = {
                type: 'rank',
                timeline: this.turnObject.timeline,
                turn: this.turnObject.turn,
                player: this.turnObject.player,
                coordinate: coordinates,
                rank: rank,
                file: file,
                check: this.turnObject.check,
                active: this.turnObject.active,
            };
            var key = utilsFuncs.squareObjectKey(labelObject);
            ranks.push({
                key: key,
                labelObject: labelObject
            });
        }
        if (!this.showRank) { ranks = []; }
        //Looking in internal rank object to see if they still exist
        for (var i = 0; i < this.rankLabels.length; i++) {
            var found = false;
            for (var j = 0; j < ranks.length; j++) {
                if (this.rankLabels[i].key === ranks[j].key) {
                    found = true;
                    this.rankLabels[i].update(ranks[j].labelObject);
                }
            }
            if (!found) {
                this.rankLabels[i].destroy();
                this.rankLabels.splice(i, 1);
                i--;
            }
        }
        //Looking in new rank array for new rank to create
        for (var j = 0; j < ranks.length; j++) {
            for (var i = 0; i < this.rankLabels.length; i++) {
                if (this.rankLabels[i].key === ranks[j].key) {
                    found = true;
                }
            }
            if (!found) {
                this.rankLabels.push(new Label(this.global, ranks[j].labelObject, this.layer));
            }
        }
    }
    destroy() {
        //Calling destroy on children
        if (typeof this.timelineLabelL !== 'undefined') {
            this.timelineLabelL.destroy();
        }
        if (typeof this.timelineLabelR !== 'undefined') {
            this.timelineLabelR.destroy();
        }
        if (typeof this.turnLabel !== 'undefined') {
            this.turnLabel.destroy();
        }
        for (var i = 0; i < this.fileLabels.length; i++) {
            this.fileLabels[i].destroy();
            this.fileLabels.splice(i, 1);
            i--;
        }
        for (var i = 0; i < this.rankLabels.length; i++) {
            this.rankLabels[i].destroy();
            this.rankLabels.splice(i, 1);
            i--;
        }
    }

    redraw() {
        //redraw all of the label objects
        let rd = (label) => {
            if (typeof label != 'undefined')
                label.redraw();
        };
        rd(this.timelineLabelL);    //might be null
        rd(this.timelineLabelR);    //might be null
        this.turnLabel.redraw();
        this.fileLabels.forEach((l, i, a) => l.redraw());
        this.rankLabels.forEach((l, i, a) => l.redraw());
    }
}

export default BoardLabel;
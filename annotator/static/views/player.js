"use strict";


// Constants. ES6 doesn't support class constants yet, thus this hack.
var PlayerViewConstants = {
    // Value of .player-control-scrubber[max]
    CONTROL_SCRUBBER_GRANULARITY: 10000,

    // How often the UI updates the displayed time
    TIME_UPDATE_DELAY: 30 /* ms */,
};


class PlayerView {
    constructor({$container, videoSrc}) {
        // Mix-in constants
        Object.assign(this, PlayerViewConstants);

        // This container of the player
        this.$container = $container;

        // The Raphael paper (canvas) for annotations
        this.$paper = null;

        // Namespaced className generator
        this.classBaseName = new Misc.ClassNameGenerator('player');

        // The invisible rect that receives drag events not targeted at speciifc 
        this.creationRect = null;

        // The keyframebar
        this.keyframebar = null;

        // Timer id used to increate <video>.on('timeupdate') frequency
        this.manualTimeupdateTimerId = null;

        // The rects
        this.rects = null;

        // Timder id for rewind
        this.rewindTimerId = null;

        // Is something being dragged?
        this.dragInProgress = false;

        // The <video> object
        this.video = null;

        // Video URL
        this.videoSrc = videoSrc;

        // Promises
        this.keyframebarReady = Misc.CustomPromise();
        this.paperReady = Misc.CustomPromise();
        this.videoReady = Misc.CustomPromise();

        // We're ready when all the components are ready.
        this.ready = Misc.CustomPromiseAll(
            this.keyframebarReady(),
            this.paperReady(),
            this.videoReady()
        );

        // Prevent adding new properties
        Misc.preventExtensions(this, PlayerView);

        this.initHandlers();
        this.initPaper();
        this.initVideo();
        this.initKeyframebar();
    }


    // Init ALL the things!

    initKeyframebar() {
        this.keyframebar = new Keyframebar({classBaseName: this.classBaseName});
        this.keyframebar.attach(this.$('keyframebar'));
        this.keyframebarReady.resolve();
    }

    initPaper() {
        // Depends on this.videoReady for this.video.videoWidth/Height
        this.videoReady().then(() => {
            var {videoWidth, videoHeight} = this.video;

            this.$paper = Raphael(this.$('paper')[0], videoWidth, videoHeight);
            this.creationRect = this.makeAndAttachRect(CreationRect);
            this.rects = [];

            $(this.creationRect).on('create-bounds', (e, bounds) => {
                var rect = this.addRect();
                rect.bounds = bounds;
                rect.focus();
                $(this).triggerHandler('create-rect', rect);
            });

            this.paperReady.resolve();
        });
    }

    initVideo() {
        // Set video props
        this.video = this.$('video')[0];
        $('video').attr('src', this.videoSrc);

        // updates time more frequently by using setInterval
        $(this.video).on('playing', () => {
            clearInterval(this.manualTimeupdateTimerId);
            this.manualTimeupdateTimerId = setInterval(() => {
                this.$('video').triggerHandler('timeupdate');
            }, this.TIME_UPDATE_DELAY);
        }).on('pause', () => {
            clearInterval(this.manualTimeupdateTimerId);
        });

        $(this.video).on("loadedmetadata", () => {
            this.videoReady.resolve();
        }).on("abort", () => {
            this.videoLoaded.reject();
        });
    }

    initHandlers() {
        this.ready().then(() => {
            // control-play => video
            // control-pause => video
            this.$on('control-play', 'click', () => this.video.play());
            this.$on('control-pause', 'click', () => this.video.pause());

            // control-time <=> video
            this.$on('control-time', 'change', () => this.video.currentTime = this.controlTime);
            $(this.video).on('timeupdate', () => this.controlTimeUnfocused = this.video.currentTime);

            // control-scrubber <=> video
            this.$on('control-scrubber', 'change input', () => this.jumpToTimeAndPause(this.controlScrubber));
            $(this.video).on('timeupdate', () => this.controlScrubberUnfocused = this.video.currentTime);

            // keyframebar => video
            $(this.keyframebar).on('jump-to-time', (e, time) => this.jumpToTimeAndPause(time));

            // key => video
            $(document).keydown(this.keydown.bind(this));
            $(document).keyup(this.keyup.bind(this));

        });
    }


    // Time control

    jumpToTimeAndPause(time) {
        this.video.currentTime = time;
        this.video.pause();
    }

    keydown(e) {
        switch (e.keyCode) {
            case 190: // .
            case 69: // e
                this.video.play();
                break;
            case 186: // ;
            case 81: // q
                this.rewind();
                break;
            case 32: // <spacebar>
                if (this.video.paused) {
                    this.video.play();
                } else {
                    this.video.pause();
                }
                return false; // prevent default
        }
    }

    keyup(e) {
        switch (e.keyCode) {
            case 190: // .
            case 69: // e
                this.video.pause();
                break;
            case 186: // ;
            case 81: // q
                this.stopRewind();
                break;
        }
    }

    rewind() {
        this.video.pause();
        clearInterval(this.rewindTimerId);
        this.rewindTimerId = setInterval(() => {
            if (this.video.currentTime <= 0) {
                this.stopRewind();
            }
            else {
                this.video.currentTime -= 0.05;
            }
        }, 20);
    }

    stopRewind() {
        if (this.rewindTimerId != null) {
            clearInterval(this.rewindTimerId);
            this.rewindTimerId = null;
        }
    }


    // Rect control

    makeAndAttachRect(KindOfRect) {
        var {classBaseName} = this;
        var rect = new KindOfRect({classBaseName});
        rect.attach(this.$paper);

        // In case drag exceeds bounds of object, set it as the cursor of the
        // entire paper
        $(rect).on('change-cursor', (e, cursor) => {
            if (this.dragInProgress) return;
            this.$('paper').css({cursor});
        });

        // .. but don't change it if there's we're in the middle of a drag
        $(rect).on('drag-start', () => {
            this.dragInProgress = true;
        });
        $(rect).on('drag-end', () => {
            this.dragInProgress = false;
        });
        return rect;
    }


    addRect() {
        var rect = this.makeAndAttachRect(Rect);
        this.rects.push(rect);
        return rect;
    }

    deleteRect(rect) {
        if (rect == null) return false;

        for (let i = 0; i < this.rects.length; i++) {
            if (this.rects[i] === rect) {
                rect.detach();
                this.rects.splice(i, 1);
                return true;
            }
        }
        throw new Error("PlayerView.deleteRect: rect not found", rect);
    }


    // UI getters and setters

    get controlTime() {
        return parseFloat(this.$('control-time').val());
    }

    get controlTimeUnfocused() {
        return this.controlTime;
    }

    set controlTimeUnfocused(value) {
        this.$('control-time:not(:focus)').val(value.toFixed(2));
    }

    get controlScrubber() {
        return parseFloat(this.$('control-scrubber').val()) / this.CONTROL_SCRUBBER_GRANULARITY * this.video.duration;
    }

    get controlScrubberUnfocused() {
        return this.controlScrubber;
    }

    set controlScrubberUnfocused(value) {
        this.$('control-scrubber:not(:focus)').val(value * this.CONTROL_SCRUBBER_GRANULARITY / this.video.duration);
    }


    // DOM/jQuery helpers

    $(extension) {
        return this.$container.find(this.classBaseName.add(extension).toSelector());
    }

    $on(extension, eventName, callback) {
        return this.$container.on(eventName, this.classBaseName.add(extension).toSelector(), callback);
    }
}

void PlayerView;
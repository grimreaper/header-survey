/* Copyright 2013 Zack Weinberg <zackw@panix.com> and other contributors.
   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at
   http://www.apache.org/licenses/LICENSE-2.0
   There is NO WARRANTY.

   Based on https://github.com/uniqname/Details-Polyfill/
   and https://github.com/jmosbech/StickyTableHeaders
   with refinements from https://github.com/mathiasbynens/jquery-details

   CAVEAT AUCTORES: In the interest of simplicity and reliability,
   this code and the associated CSS do not attempt to handle <details>
   elements with any structure other than

       <details><summary>...</summary><div>...</div></details>

   The management hopes this is not a major inconvenience.

   IMPLEMENTATION NOTE: We don't actually bother trying to use
   position:sticky, because it's only supported in some versions
   of Webkit and only if you toggle experimental features on, and
   even then doesn't work with <thead>, and there's no good way to
   detect whether it's gonna work with any given element.

   So instead, any element with the literal "sticky" in its class list
   will be sticky. */

;(function(doc, win) {
    'use strict';
    var bodyEl = doc.body,
        isOpera = false,
        detailsNotSupported = false,
        stickyEls,
        stickyClones,
        stickyTops,
        stickyBottoms,
        ticking = 0,
        frameCB = 0,
        requestAnimationFrame =
            win.requestAnimationFrame ||
            win.mozRequestAnimationFrame ||
            win.webkitRequestAnimationFrame ||
            win.msRequestAnimationFrame ||
            function (cb) {
                // 60fps is one frame every 16.6̅ms, so ask for half of that,
                // rounded down
                return setTimeout(cb, 8);
            },
        cancelAnimationFrame =
            win.cancelAnimationFrame ||
            win.mozCancelAnimationFrame ||
            win.webkitCancelAnimationFrame ||
            win.msCancelAnimationFrame ||
            win.clearTimeout;

    function addEvent (el, eventName, f) {
        // W3C event binding
        if (el.addEventListener)
            el.addEventListener(eventName, f);
        // IE event binding
        else if (el.attachEvent)
            el.attachEvent('on' + eventName, f);
        // Fallback, but don't overwrite a preexisting 'onclick' attribute.
        else if (el['on' + eventName] === null)
            el['on' + eventName] = f;
    }

    function addClass (el, cls) {
        if ('classList' in el)
            el.classList.add(cls);
        else if (el.className === '')
            el.className = cls;
        else
            el.className += (' ' + cls);
    }

    function removeClass (el, cls) {
        function quotemeta(s) {
            return s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        }

        if ('classList' in el)
            el.classList.remove(cls);
        else if (el.className === cls)
            el.className = '';
        else {
            el.className = el.className.replace(
                new RegExp('(?:^|\\s)' + quotemeta(cls) + '(?!\\S)', 'g'), '');
        }
    }

    // Code used only for <details>

    function testDetailsSupported () {
        var el = doc.createElement('details'), diff;
        if (!('open' in el))
            return false;

        el.innerHTML =
            '<summary>a</summary><div style="position:static">b</div>';
        el.style.display = 'block';
        bodyEl.appendChild(el);
        diff = el.offsetHeight;
        el.open = true;
        diff = diff != el.offsetHeight;
        bodyEl.removeChild(el);
        return diff;
    }

    function toggleDetails (e) {
        // When a <summary> element is actuated, toggle the parent
        // <details> element's 'open' attribute. CSS does the rest.
        var el = e.target || e.srcElement;
        if (detailsNotSupported)
            el.focus();

        el = el.parentNode;
        if (el.hasAttribute('open')) {
            if (detailsNotSupported)
                el.removeAttribute('open');
            el.setAttribute('aria-expanded', false)
        } else {
            if (detailsNotSupported)
                el.setAttribute('open', 'open');
            el.setAttribute('aria-expanded', true)
        }
    }

    function detailsInit () {
        var i, el, summaryEls;
        summaryEls = doc.querySelectorAll('details>summary');
        for (i = 0; i < summaryEls.length; i++) {
            el = summaryEls[i];
            el.parentNode.setAttribute('aria-expanded',
                                       !!el.getAttribute('open'));
            el.setAttribute('role', 'button');
            addEvent(el, 'click', toggleDetails);
            if (detailsNotSupported) {
                el.tabIndex = 0;
                addEvent(el, 'keyup', function(e) {
                    // Space or Enter is pressed: behave as if clicked.
                    if (e.keyCode == 32 || (!isOpera && e.keyCode == 13)) {
                        toggleDetails.call(this, e);
                    }
                });
                addClass(el.parentNode, 'polyfilla');
            }
        }
    }

    // Code used only for 'sticky'

    function pageYOffset () {
        var y = win.pageYOffset;
        if (y !== undefined) return y;
        return (doc.documentElement ||
                bodyEl.parentNode ||
                bodyEl).scrollTop;
    }

    // requestAnimationFrame is used to throttle scroll-triggered updates
    // to a rate at which it should not cause jank.
    // Technique from http://www.html5rocks.com/en/tutorials/speed/animations/#debouncing-scroll-events
    function stickyUpdate () {
        var i, l, y = pageYOffset();
        ticking = 0;
        frameCB = 0;

        // Theoretically, at most two elements should need an update,
        // but by iterating over the entire list we ensure that we
        // never miss one.
        for (i = 0; i < stickyClones.length; i++) {
            l = stickyClones[i];
            if (y < stickyTops[i]) {
                addClass(l, 'stickyAbove');
                removeClass(l, 'stickyStuck');
                removeClass(l, 'stickyBelow');
            } else if (y < stickyBottoms[i]) {
                removeClass(l, 'stickyAbove');
                addClass(l, 'stickyStuck');
                removeClass(l, 'stickyBelow');
            } else {
                removeClass(l, 'stickyAbove');
                removeClass(l, 'stickyStuck');
                addClass(l, 'stickyBelow');
            }
        }
    }

    function stickyRecalculate () {
        var i, y, l, p, lRect, pRect;
        if (stickyClones !== undefined) {
            for (i = 0; i < stickyClones.length; i++) {
                p = stickyClones[i];
                p.parentNode.removeChild(p);
            }
        }
        y = pageYOffset();
        stickyEls = doc.getElementsByClassName('sticky');
        stickyTops = Array(stickyEls.length);
        stickyBottoms = Array(stickyEls.length);
        stickyClones = Array(stickyEls.length);
        for (i = 0; i < stickyEls.length; i++) {
            l = stickyEls[i];
            p = l.parentNode;
            lRect = l.getBoundingClientRect();
            pRect = p.getBoundingClientRect();
            stickyClones[i] = l.cloneNode(true);
            removeClass(stickyClones[i], 'sticky');
            addClass(stickyClones[i], 'stickyAbove');

            // The top threshold for element i is just its vertical
            // offset from the top of the page.  The bottom threshold
            // for element i, however, is the vertical offset of its
            // *parent's bottom* minus its *height*; this is the point
            // at which the element should come unstuck from the
            // viewport and scroll out of view with the parent.
            stickyTops[i] = y + lRect.top;
            stickyBottoms[i] = y + pRect.bottom - (lRect.bottom - lRect.top);

        }
        // Insert clones and adjust parent styles in a second
        // loop so that they don't interfere with the position
        // calculations above.
        for (i = 0; i < stickyEls.length; i++) {
            l = stickyEls[i];
            p = l.parentNode;
            // For the .past treatment to work correctly, the parent of each
            // .sticky must be an abspos container.
            if (win.getComputedStyle(p).position === 'static')
                p.style.position = 'relative';
            p.insertBefore(stickyClones[i], l.nextSibling);
        }
        stickyUpdate();
    }

    function stickyInit () {
        addEvent(win, 'resize', function () {
            if (ticking < 2) {
                if (frameCB) cancelAnimationFrame(frameCB);
                frameCB = requestAnimationFrame(stickyRecalculate);
                ticking = 2;
            }
        });
        addEvent(win, 'scroll', function () {
            if (ticking < 1) {
                frameCB = requestAnimationFrame(stickyUpdate);
                ticking = 1;
            }
        });
        stickyRecalculate();
    };

    // Initialization

    addEvent(win, 'load', function () {
	isOpera = (Object.prototype.toString.call(win.opera) ===
                   '[object Opera]');
        detailsNotSupported = !testDetailsSupported();
        detailsInit();
        stickyInit();
    });
})(document, window);

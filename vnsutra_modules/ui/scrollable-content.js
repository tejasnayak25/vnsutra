function bindActionbarScroll({
    actionbar,
    actionContent,
    contentNode,
    touchTargets = [],
    inertia = true,
    wheelFactor = 1,
    dragFactor = 1,
    resetToTop = true
}) {
    if (!actionbar || !actionContent || !contentNode) {
        return () => {};
    }

    if (typeof actionbar.__scrollCleanup === "function") {
        actionbar.__scrollCleanup();
    }

    const scrollbar = actionbar.scrollbar;
    if (!Number.isFinite(contentNode.__actionbarBaseY)) {
        contentNode.__actionbarBaseY = contentNode.y();
    }
    const baseY = contentNode.__actionbarBaseY;
    const targets = (touchTargets.length ? touchTargets : [actionContent]).filter(Boolean);

    let dragListenersAttached = false;
    let startClientY = 0;
    let startScroll = 0;
    let lastMoveTs = 0;
    let inertiaVelocity = 0;
    let inertiaRaf = null;
    let inertiaLastTs = 0;
    let wheelInertiaTimeout = null;
    let lastWheelTs = 0;
    let touchMoved = false;
    let touchSuppressTapUntil = 0;
    let touchMoveRaf = null;
    let pendingTouchClientY = 0;

    const stopInertia = () => {
        if (inertiaRaf !== null) {
            cancelAnimationFrame(inertiaRaf);
            inertiaRaf = null;
        }
        inertiaLastTs = 0;
        inertiaVelocity = 0;
        if (wheelInertiaTimeout) {
            clearTimeout(wheelInertiaTimeout);
            wheelInertiaTimeout = null;
        }
    };

    const clearTouchMoveFrame = () => {
        if (touchMoveRaf !== null) {
            cancelAnimationFrame(touchMoveRaf);
            touchMoveRaf = null;
        }
    };

    const markTouchScroll = () => {
        touchMoved = true;
        touchSuppressTapUntil = performance.now() + 350;
        actionbar.__scrollSuppressTapUntil = touchSuppressTapUntil;
    };

    const runInertia = () => {
        if (!inertia || Math.abs(inertiaVelocity) < 0.02) {
            stopInertia();
            return;
        }

        const step = (ts) => {
            if (!inertiaLastTs) {
                inertiaLastTs = ts;
            }

            const dt = Math.min(32, Math.max(8, ts - inertiaLastTs));
            inertiaLastTs = ts;

            const prevScroll = actionbar.scrollHeight;
            actionbar.scrollHeight = prevScroll + (inertiaVelocity * dt);
            scrollbar.fire("dragmove");

            const moved = actionbar.scrollHeight - prevScroll;
            if (Math.abs(moved) < 0.01) {
                stopInertia();
                return;
            }

            inertiaVelocity *= Math.pow(0.92, dt / 16);
            if (Math.abs(inertiaVelocity) < 0.02) {
                stopInertia();
                return;
            }

            inertiaRaf = requestAnimationFrame(step);
        };

        if (inertiaRaf !== null) {
            cancelAnimationFrame(inertiaRaf);
        }
        inertiaLastTs = 0;
        inertiaRaf = requestAnimationFrame(step);
    };

    const applyScrollFromBar = () => {
        if (!actionbar.scrollScale || actionbar.scrollScale <= 0) {
            contentNode.y(baseY);
            return;
        }
        contentNode.y(baseY - (actionbar.scrollHeight / actionbar.scrollScale));
    };

    const removeDragListeners = () => {
        if (!dragListenersAttached) {
            return;
        }
        clearTouchMoveFrame();
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onPointerUp);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onPointerUp);
        window.removeEventListener("touchcancel", onPointerUp);
        dragListenersAttached = false;
    };

    const onMouseMove = (e) => {
        const deltaY = startClientY - e.clientY;
        const prevScroll = actionbar.scrollHeight;
        actionbar.scrollHeight = startScroll + (deltaY * actionbar.scrollScale * dragFactor);
        scrollbar.fire("dragmove");

        const now = performance.now();
        const dt = Math.max(1, now - lastMoveTs);
        const moved = actionbar.scrollHeight - prevScroll;
        inertiaVelocity = moved / dt;
        lastMoveTs = now;
    };

    const onTouchMove = (e) => {
        const touch = e.touches?.[0];
        if (!touch) {
            return;
        }
        e.preventDefault?.();
        pendingTouchClientY = touch.clientY;

        if (touchMoveRaf !== null) {
            return;
        }

        touchMoveRaf = requestAnimationFrame(() => {
            touchMoveRaf = null;

            if (!touchMoved && Math.abs(pendingTouchClientY - startClientY) >= 6) {
                markTouchScroll();
            }

            const deltaY = startClientY - pendingTouchClientY;
            const prevScroll = actionbar.scrollHeight;
            actionbar.scrollHeight = startScroll + (deltaY * actionbar.scrollScale * dragFactor);
            scrollbar.fire("dragmove");

            const now = performance.now();
            const dt = Math.max(1, now - lastMoveTs);
            const moved = actionbar.scrollHeight - prevScroll;
            inertiaVelocity = moved / dt;
            lastMoveTs = now;
        });
    };

    const onPointerUp = () => {
        removeDragListeners();
        if (!touchMoved) {
            touchSuppressTapUntil = 0;
            actionbar.__scrollSuppressTapUntil = 0;
        }
        runInertia();
    };

    const startDrag = (clientY) => {
        stopInertia();
        touchMoved = false;
        touchSuppressTapUntil = 0;
        actionbar.__scrollSuppressTapUntil = 0;
        startClientY = clientY;
        startScroll = actionbar.scrollHeight;
        lastMoveTs = performance.now();
        inertiaVelocity = 0;

        removeDragListeners();
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onPointerUp);
        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("touchend", onPointerUp);
        window.addEventListener("touchcancel", onPointerUp);
        dragListenersAttached = true;
    };

    const onTargetPointerDown = (ev) => {
        if (ev.type === "touchstart") {
            const touch = ev.evt.touches?.[0];
            if (touch) {
                startDrag(touch.clientY);
            }
            return;
        }
        startDrag(ev.evt.clientY);
    };

    const onWheel = (e) => {
        const { x: minX, y: minY } = actionContent.getAbsolutePosition();
        const maxX = minX + actionContent.width();
        const maxY = minY + actionContent.height();
        const inBounds = e.clientX >= minX && e.clientX <= maxX && e.clientY >= minY && e.clientY <= maxY;
        if (!inBounds) {
            return;
        }

        e.preventDefault?.();
        stopInertia();

        let wheelDelta = e.deltaY;
        if (e.deltaMode === 1) {
            wheelDelta *= 16;
        } else if (e.deltaMode === 2) {
            wheelDelta *= actionContent.height();
        }

        const prevScroll = actionbar.scrollHeight;
        actionbar.scrollHeight += (wheelDelta * actionbar.scrollScale * wheelFactor);
        scrollbar.fire("dragmove");

        const now = performance.now();
        const dt = Math.max(1, lastWheelTs ? (now - lastWheelTs) : 16);
        const moved = actionbar.scrollHeight - prevScroll;
        const instantVelocity = moved / dt;
        inertiaVelocity = (inertiaVelocity * 0.55) + (instantVelocity * 0.45);
        lastWheelTs = now;

        if (inertia && Math.abs(inertiaVelocity) >= 0.02) {
            if (wheelInertiaTimeout) {
                clearTimeout(wheelInertiaTimeout);
            }
            wheelInertiaTimeout = setTimeout(() => {
                runInertia();
            }, 55);
        }
    };

    scrollbar.off("dragmove");
    scrollbar.on("dragmove", applyScrollFromBar);

    actionbar.scrollbarHeight = actionContent.height() / Math.max(1, contentNode.height());

    if (actionbar.scrollbarHeight > 0) {
        if (resetToTop) {
            contentNode.y(baseY);
            actionbar.scrollHeight = 0;
            scrollbar.fire("dragmove");
        } else {
            applyScrollFromBar();
        }

        targets.forEach((target) => {
            target.off("mousedown touchstart", onTargetPointerDown);
            target.on("mousedown touchstart", onTargetPointerDown);
        });

        window.addEventListener("wheel", onWheel, { passive: false });
    }

    const cleanup = () => {
        if (actionbar.__scrollCleanup === cleanup) {
            actionbar.__scrollCleanup = null;
        }
        removeDragListeners();
        stopInertia();
        clearTouchMoveFrame();
        actionbar.__scrollSuppressTapUntil = 0;
        window.removeEventListener("wheel", onWheel);
        scrollbar.off("dragmove", applyScrollFromBar);
        targets.forEach((target) => {
            target.off("mousedown touchstart", onTargetPointerDown);
        });
    };

    actionbar.__scrollCleanup = cleanup;
    return cleanup;
}

function bindHorizontalScroll({
    actionbar,
    actionContent,
    contentNode,
    touchTargets = [],
    inertia = true,
    wheelFactor = 1,
    dragFactor = 1,
    allow2D = false,
    resetToStart = true
}) {
    if (!actionbar || !actionContent || !contentNode) {
        return () => {};
    }

    if (typeof actionbar.__scrollCleanup === "function") {
        actionbar.__scrollCleanup();
    }

    const scrollbar = actionbar.scrollbar;
    const scrollbarWasVisible = typeof scrollbar?.visible === "function" ? scrollbar.visible() : true;
    if (typeof scrollbar?.visible === "function") {
        scrollbar.visible(false);
    }

    if (!Number.isFinite(contentNode.__actionbarBaseX)) {
        contentNode.__actionbarBaseX = contentNode.x();
    }
    if (!Number.isFinite(contentNode.__actionbarBaseY)) {
        contentNode.__actionbarBaseY = contentNode.y();
    }
    const baseX = contentNode.__actionbarBaseX;
    const baseY = contentNode.__actionbarBaseY;
    const targets = (touchTargets.length ? touchTargets : [actionContent]).filter(Boolean);

    let scrollX = resetToStart ? 0 : Math.max(0, baseX - contentNode.x());
    let scrollY = (resetToStart || !allow2D) ? 0 : Math.max(0, baseY - contentNode.y());

    const getMaxScrollX = () => Math.max(0, contentNode.width() - actionContent.width());
    const getMaxScrollY = () => allow2D ? Math.max(0, contentNode.height() - actionContent.height()) : 0;

    const applyScroll = () => {
        const maxX = getMaxScrollX();
        scrollX = Math.max(0, Math.min(scrollX, maxX));
        contentNode.x(baseX - scrollX);

        if (allow2D) {
            const maxY = getMaxScrollY();
            scrollY = Math.max(0, Math.min(scrollY, maxY));
            contentNode.y(baseY - scrollY);
        } else {
            contentNode.y(baseY);
        }
    };

    applyScroll();

    let dragListenersAttached = false;
    let startClientX = 0;
    let startClientY = 0;
    let startScrollX = 0;
    let startScrollY = 0;
    let lastMoveTs = 0;
    let inertiaVelocityX = 0;
    let inertiaVelocityY = 0;
    let inertiaRaf = null;
    let inertiaLastTs = 0;
    let touchMoved = false;

    const stopInertia = () => {
        if (inertiaRaf !== null) {
            cancelAnimationFrame(inertiaRaf);
            inertiaRaf = null;
        }
        inertiaLastTs = 0;
        inertiaVelocityX = 0;
        inertiaVelocityY = 0;
    };

    const markTouchScroll = () => {
        touchMoved = true;
        actionbar.__scrollSuppressTapUntil = performance.now() + 350;
    };

    const runInertia = () => {
        if (!inertia || (Math.abs(inertiaVelocityX) < 0.02 && Math.abs(inertiaVelocityY) < 0.02)) {
            stopInertia();
            return;
        }

        const step = (ts) => {
            if (!inertiaLastTs) {
                inertiaLastTs = ts;
            }
            const dt = Math.min(32, Math.max(8, ts - inertiaLastTs));
            inertiaLastTs = ts;

            scrollX += inertiaVelocityX * dt;
            if (allow2D) {
                scrollY += inertiaVelocityY * dt;
            }
            applyScroll();

            inertiaVelocityX *= Math.pow(0.92, dt / 16);
            inertiaVelocityY *= Math.pow(0.92, dt / 16);

            if (Math.abs(inertiaVelocityX) < 0.02 && Math.abs(inertiaVelocityY) < 0.02) {
                stopInertia();
                return;
            }

            inertiaRaf = requestAnimationFrame(step);
        };

        if (inertiaRaf !== null) {
            cancelAnimationFrame(inertiaRaf);
        }
        inertiaLastTs = 0;
        inertiaRaf = requestAnimationFrame(step);
    };

    const removeDragListeners = () => {
        if (!dragListenersAttached) return;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onPointerUp);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onPointerUp);
        window.removeEventListener("touchcancel", onPointerUp);
        dragListenersAttached = false;
    };

    const onMouseMove = (e) => {
        const deltaX = startClientX - e.clientX;
        const deltaY = startClientY - e.clientY;
        if (!touchMoved && (Math.abs(deltaX) >= 6 || (allow2D && Math.abs(deltaY) >= 6))) {
            markTouchScroll();
        }

        const prevX = scrollX;
        const prevY = scrollY;
        scrollX = startScrollX + (deltaX * dragFactor);
        if (allow2D) {
            scrollY = startScrollY + (deltaY * dragFactor);
        }
        applyScroll();

        const now = performance.now();
        const dt = Math.max(1, now - lastMoveTs);
        inertiaVelocityX = (scrollX - prevX) / dt;
        inertiaVelocityY = (scrollY - prevY) / dt;
        lastMoveTs = now;
    };

    const onTouchMove = (e) => {
        const touch = e.touches?.[0];
        if (!touch) return;
        e.preventDefault?.();

        const deltaX = startClientX - touch.clientX;
        const deltaY = startClientY - touch.clientY;
        if (!touchMoved && (Math.abs(deltaX) >= 6 || (allow2D && Math.abs(deltaY) >= 6))) {
            markTouchScroll();
        }

        const prevX = scrollX;
        const prevY = scrollY;
        scrollX = startScrollX + (deltaX * dragFactor);
        if (allow2D) {
            scrollY = startScrollY + (deltaY * dragFactor);
        }
        applyScroll();

        const now = performance.now();
        const dt = Math.max(1, now - lastMoveTs);
        inertiaVelocityX = (scrollX - prevX) / dt;
        inertiaVelocityY = (scrollY - prevY) / dt;
        lastMoveTs = now;
    };

    const onPointerUp = () => {
        removeDragListeners();
        if (!touchMoved) {
            actionbar.__scrollSuppressTapUntil = 0;
        }
        runInertia();
    };

    const startDrag = (clientX, clientY) => {
        stopInertia();
        touchMoved = false;
        actionbar.__scrollSuppressTapUntil = 0;
        startClientX = clientX;
        startClientY = clientY;
        startScrollX = scrollX;
        startScrollY = scrollY;
        lastMoveTs = performance.now();
        inertiaVelocityX = 0;
        inertiaVelocityY = 0;

        removeDragListeners();
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onPointerUp);
        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("touchend", onPointerUp);
        window.addEventListener("touchcancel", onPointerUp);
        dragListenersAttached = true;
    };

    const onTargetPointerDown = (ev) => {
        if (ev.type === "touchstart") {
            const touch = ev.evt?.touches?.[0] || ev.touches?.[0];
            if (touch) startDrag(touch.clientX, touch.clientY);
            return;
        }
        startDrag(ev.evt?.clientX ?? ev.clientX, ev.evt?.clientY ?? ev.clientY);
    };

    const onWheel = (e) => {
        const { x: minX, y: minY } = actionContent.getAbsolutePosition?.() || { x: 0, y: 0 };
        const maxX = minX + actionContent.width();
        const maxY = minY + actionContent.height();
        const inBounds = e.clientX >= minX && e.clientX <= maxX && e.clientY >= minY && e.clientY <= maxY;
        if (!inBounds) return;

        e.preventDefault?.();
        stopInertia();

        let delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (e.deltaMode === 1) delta *= 16;
        else if (e.deltaMode === 2) delta *= actionContent.width();

        scrollX += delta * wheelFactor;
        applyScroll();
    };

    targets.forEach((target) => {
        target.off("mousedown touchstart", onTargetPointerDown);
        target.on("mousedown touchstart", onTargetPointerDown);
    });

    window.addEventListener("wheel", onWheel, { passive: false });

    const cleanup = () => {
        if (actionbar.__scrollCleanup === cleanup) {
            actionbar.__scrollCleanup = null;
        }
        removeDragListeners();
        stopInertia();
        actionbar.__scrollSuppressTapUntil = 0;
        window.removeEventListener("wheel", onWheel);
        targets.forEach((target) => {
            target.off("mousedown touchstart", onTargetPointerDown);
        });
        if (typeof scrollbar?.visible === "function") {
            scrollbar.visible(scrollbarWasVisible);
        }
    };

    actionbar.__scrollCleanup = cleanup;
    return cleanup;
}

function cleanupActionbarScroll(actionbar) {
    if (actionbar && typeof actionbar.__scrollCleanup === "function") {
        actionbar.__scrollCleanup();
    }
}

export { bindActionbarScroll, bindHorizontalScroll, cleanupActionbarScroll };
export default bindActionbarScroll;

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

        const deltaY = startClientY - touch.clientY;
        const prevScroll = actionbar.scrollHeight;
        actionbar.scrollHeight = startScroll + (deltaY * actionbar.scrollScale * dragFactor);
        scrollbar.fire("dragmove");

        const now = performance.now();
        const dt = Math.max(1, now - lastMoveTs);
        const moved = actionbar.scrollHeight - prevScroll;
        inertiaVelocity = moved / dt;
        lastMoveTs = now;
    };

    const onPointerUp = () => {
        removeDragListeners();
        runInertia();
    };

    const startDrag = (clientY) => {
        stopInertia();
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
        window.removeEventListener("wheel", onWheel);
        scrollbar.off("dragmove", applyScrollFromBar);
        targets.forEach((target) => {
            target.off("mousedown touchstart", onTargetPointerDown);
        });
    };

    actionbar.__scrollCleanup = cleanup;
    return cleanup;
}

function cleanupActionbarScroll(actionbar) {
    if (actionbar && typeof actionbar.__scrollCleanup === "function") {
        actionbar.__scrollCleanup();
    }
}

export { bindActionbarScroll, cleanupActionbarScroll };
export default bindActionbarScroll;

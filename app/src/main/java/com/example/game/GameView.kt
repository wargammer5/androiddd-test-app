package com.example.game

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.Choreographer
import android.view.MotionEvent
import android.view.View

/**
 * Game screen: drives a frame loop via Choreographer, calls [update] and redraws every frame.
 * Game logic goes into [update], [onDraw] and [onTouchEvent].
 */
class GameView(context: Context) : View(context), Choreographer.FrameCallback {

    private var running = false
    private var lastFrameNanos = 0L

    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        textSize = 64f
    }

    fun resume() {
        if (running) return
        running = true
        lastFrameNanos = 0L
        Choreographer.getInstance().postFrameCallback(this)
    }

    fun pause() {
        running = false
        Choreographer.getInstance().removeFrameCallback(this)
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (!running) return
        val dt = if (lastFrameNanos == 0L) 0f else (frameTimeNanos - lastFrameNanos) / 1_000_000_000f
        lastFrameNanos = frameTimeNanos
        update(dt)
        invalidate()
        Choreographer.getInstance().postFrameCallback(this)
    }

    /** Advances game state by [dt] seconds. */
    private fun update(dt: Float) {
    }

    override fun onDraw(canvas: Canvas) {
        canvas.drawColor(Color.BLACK)
        canvas.drawText("Game", width / 2f, height / 2f, textPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        return true
    }
}

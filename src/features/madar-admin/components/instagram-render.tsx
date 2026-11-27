"use client"

import { toJpeg } from "html-to-image"
import { createRoot } from "react-dom/client"

import type { AdminInstagramPost } from "../services/instagram-admin.service"
import { InstagramPostArt, POST_SIZE } from "./instagram-templates"

// Turns a post's design into the 1080×1080 JPEG Instagram gets (Instagram only takes JPEG). It
// runs in the reviewer's browser, which draws the Arabic text and the design exactly as shown.

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)))

async function imagesReady(root: HTMLElement) {
  await Promise.all(
    [...root.querySelectorAll("img")].map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            image.onload = resolve
            image.onerror = resolve
          })
    )
  )
}

// Base64 of the JPEG (no "data:" prefix).
export async function renderPostJpeg(
  post: Pick<AdminInstagramPost, "template" | "design">
): Promise<string> {
  const host = document.createElement("div")
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${POST_SIZE}px;height:${POST_SIZE}px;pointer-events:none;`
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    root.render(<InstagramPostArt template={post.template} design={post.design} />)
    await nextFrame()
    await nextFrame()
    await document.fonts.ready
    await imagesReady(host)
    const node = host.firstElementChild as HTMLElement
    const options = {
      width: POST_SIZE,
      height: POST_SIZE,
      pixelRatio: 1,
      quality: 0.93,
      backgroundColor: "#ffffff",
      cacheBust: true,
    }
    // The first pass warms html-to-image's font and image cache; the second is the real one.
    await toJpeg(node, options)
    const dataUrl = await toJpeg(node, options)
    return dataUrl.slice(dataUrl.indexOf(",") + 1)
  } finally {
    root.unmount()
    host.remove()
  }
}

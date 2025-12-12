import React, { useState, useEffect } from 'react';

// ============================================
// SCROLLING BACKGROUND COMPONENT
// Animated columns of images for the home page
// Uses Wikimedia Commons API for dynamic image fetching
// ============================================

// Configuration - easy to customize
const CONFIG = {
  columns: 4,           // Number of columns to display
  imageWidth: 300,      // Image width in pixels
  imageHeight: 230,     // Image height in pixels (4/3 ratio)
  gap: 48,              // Gap between images in pixels
  opacity: 1,         // Background opacity
  padding: 48,          // Horizontal padding in pixels
  imagesPerColumn: 6,   // Number of images to fetch per column
};

// Image keywords for each column - just simple search terms!
// These get searched on Wikimedia Commons automatically
const COLUMN_KEYWORDS = [
  // Column 1 - Art & Space
  ['starry night painting', 'empire state building', 'pleiades stars', 'great wave painting', 'mona lisa', 'sunset landscape'],
  // Column 2 - Animals & Nature
  ['cat portrait', 'golden retriever dog', 'fresh fruits', 'mandelbrot fractal', 'orange cat', 'mountain goat'],
  // Column 3 - Space & Landmarks
  ['pillars of creation', 'mount everest', 'earth from space', 'golden gate bridge', 'colosseum rome', 'macro ant'],
  // Column 4 - Nature & Architecture
  ['mountain peak', 'colorful dice', 'waterfall nature', 'forest river', 'sunrise ocean', 'golden retriever'],
];

// Fetch images from Wikimedia Commons API
async function fetchFromWikimedia(keywords: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      origin: '*',
      action: 'query',
      generator: 'search',
      gsrsearch: `${keywords} filetype:bitmap`,
      gsrnamespace: '6',
      gsrlimit: '3',
      prop: 'imageinfo',
      iiprop: 'url|mime',
      iiurlwidth: '400',
      format: 'json'
    });

    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
    const data = await res.json();

    if (!data.query?.pages) return [];

    const urls: string[] = [];
    const pages = Object.values(data.query.pages) as any[];

    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info) continue;

      const mime = info.mime || '';
      if (!mime.startsWith('image/')) continue;

      const imageUrl = info.thumburl || info.url;
      if (imageUrl) urls.push(imageUrl);
    }

    return urls;
  } catch {
    return [];
  }
}

// Animation classes for alternating scroll directions
const ANIMATIONS = ['animate-scroll-up', 'animate-scroll-down', 'animate-scroll-up-slow', 'animate-scroll-down-slow'];

// Single image card component
const ImageCard: React.FC<{ src: string; width: number; height: number }> = ({ src, width, height }) => (
  <div
    className="rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0"
    style={{ width, height }}
  >
    <img
      src={src}
      alt=""
      className="w-full h-full object-cover"
      loading="lazy"
    />
  </div>
);

// Single column component
const ScrollColumn: React.FC<{
  images: string[];
  animation: string;
  width: number;
  height: number;
  gap: number;
  hidden?: boolean;
}> = ({ images, animation, width, height, gap, hidden }) => (
  <div
    className={`flex flex-col ${animation} ${hidden ? 'hidden lg:flex' : ''}`}
    style={{ width, gap }}
  >
    {images.map((src, i) => (
      <ImageCard key={i} src={src} width={width} height={height} />
    ))}
    {/* Duplicate for seamless loop */}
    {images.slice(0, Math.ceil(images.length / 2)).map((src, i) => (
      <ImageCard key={`dup-${i}`} src={src} width={width} height={height} />
    ))}
  </div>
);

// Main scrolling background component
const ScrollingBackground: React.FC = () => {
  const { columns, imageWidth, imageHeight, gap, opacity, padding } = CONFIG;
  const [columnImages, setColumnImages] = useState<string[][]>([[], [], [], []]);

  // Cache key for localStorage
  const CACHE_KEY = 'omnilearn_bg_images';
  const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Fetch images on mount, using localStorage cache
  useEffect(() => {
    const fetchAllImages = async () => {
      // Check localStorage cache first
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { images, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_EXPIRY_MS && images?.length > 0) {
            setColumnImages(images);
            return; // Use cached images
          }
        }
      } catch { /* Cache read failed, fetch fresh */ }

      // Fetch fresh images from Wikimedia
      const activeKeywords = COLUMN_KEYWORDS.slice(0, columns);

      const results = await Promise.all(
        activeKeywords.map(async (keywords) => {
          const allUrls: string[] = [];
          for (const keyword of keywords) {
            const urls = await fetchFromWikimedia(keyword);
            if (urls.length > 0) allUrls.push(urls[0]); // Take first result
            if (allUrls.length >= CONFIG.imagesPerColumn) break;
          }
          return allUrls;
        })
      );

      setColumnImages(results);

      // Cache results in localStorage
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          images: results,
          timestamp: Date.now()
        }));
      } catch { /* Cache write failed, ignore */ }
    };

    fetchAllImages();
  }, [columns]);

  // Use only columns that have images
  const activeColumns = columnImages.slice(0, columns).filter(col => col.length > 0);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Gradient overlays for fade effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-zinc-950/50 to-zinc-950 z-10"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-transparent to-zinc-950 z-10"></div>

      {/* Scrolling columns */}
      <div
        className="absolute inset-0 flex justify-around"
        style={{ opacity, paddingLeft: padding, paddingRight: padding }}
      >
        {activeColumns.map((images, colIndex) => (
          <ScrollColumn
            key={colIndex}
            images={images}
            animation={ANIMATIONS[colIndex % ANIMATIONS.length]}
            width={imageWidth}
            height={imageHeight}
            gap={gap}
            hidden={colIndex >= 2}
          />
        ))}
      </div>

      {/* Center spotlight/glow effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-amber-400/10 rounded-full blur-[150px] z-5"></div>
    </div>
  );
};

export default ScrollingBackground;

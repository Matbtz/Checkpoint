import { useState, useEffect } from 'react';
import ColorThief from 'colorthief';

interface ImageColors {
  primary: string;
  secondary: string;
}

export function useImageColor(url: string | null | undefined): { colors: ImageColors | null; loading: boolean } {
    const [colors, setColors] = useState<ImageColors | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!url) {
            setColors(null);
            return;
        }

        let isMounted = true;
        setLoading(true);

        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = url;

        img.onload = () => {
            if (!isMounted) return;
            try {
                const colorThief = new ColorThief();
                const palette = colorThief.getPalette(img, 3);

                if (palette && palette.length >= 2) {
                     const primary = `rgb(${palette[0].join(',')})`;
                     const secondary = `rgb(${palette[1].join(',')})`;
                     setColors({ primary, secondary });
                } else if (palette && palette.length === 1) {
                     const primary = `rgb(${palette[0].join(',')})`;
                     setColors({ primary, secondary: primary });
                } else {
                     setColors(null);
                }
            } catch (error) {
                console.warn('Color extraction failed', error);
                setColors(null);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        img.onerror = () => {
             if (isMounted) {
                 // Silently fail to avoid console noise for 404s or CORS blocks
                 setLoading(false);
             }
        };

        return () => {
            isMounted = false;
        };

    }, [url]);

    return { colors, loading };
}

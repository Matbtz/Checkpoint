"use client";

import React, { useState, useEffect } from 'react';
import Image, { ImageProps } from 'next/image';
import { fixBrokenImage } from '@/actions/images';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';

interface SafeImageProps extends Omit<ImageProps, 'onError'> {
    fallback?: React.ReactNode;
    containerClassName?: string;
    gameId?: string;
    imageType?: 'COVER' | 'BACKGROUND';
}

export function SafeImage({
    src,
    alt,
    className,
    containerClassName,
    fallback,
    gameId,
    imageType = 'COVER',
    ...props
}: SafeImageProps) {
    const [imgSrc, setImgSrc] = useState(src);
    const [hasError, setHasError] = useState(false);
    const [isFixing, setIsFixing] = useState(false);
    const [fixAttempted, setFixAttempted] = useState(false);

    // Sync state with props if parent changes src
    useEffect(() => {
        setImgSrc(src);
        setHasError(false);
        setFixAttempted(false);
    }, [src]);

    const handleError = async () => {
        if (hasError) return; // Prevent infinite loops if multiple errors fire
        setHasError(true);

        if (gameId && !fixAttempted && !isFixing) {
            // Check session storage to avoid repeated failed attempts in one session
            const storageKey = `fix_attempt_${gameId}_${imageType}`;
            if (sessionStorage.getItem(storageKey)) {
                console.log(`[SafeImage] Skipping auto-fix for ${gameId} (already attempted in this session)`);
                setFixAttempted(true);
                return;
            }

            console.log(`[SafeImage] Attempting to auto-fix image for game ${gameId}...`);
            setIsFixing(true);
            setFixAttempted(true);
            sessionStorage.setItem(storageKey, 'true');

            try {
                const result = await fixBrokenImage(gameId, imageType);

                if (result && result.success && result.newUrl && result.newUrl !== imgSrc) {
                    console.log(`[SafeImage] Fixed image! Switching to: ${result.newUrl}`);
                    setImgSrc(result.newUrl);
                    setHasError(false); // Reset error to try loading new image
                }
            } catch (err) {
                console.error("[SafeImage] Failed to fix image", err);
            } finally {
                setIsFixing(false);
            }
        }
    };

    if (!imgSrc || (hasError && !isFixing && fixAttempted)) {
        return (
            <div className={cn("flex flex-col h-full w-full items-center justify-center bg-zinc-800 text-zinc-400 p-4 text-center select-none", containerClassName)}>
                {/* Fallback Content */}
                {fallback || (
                    <div className="flex flex-col items-center gap-2">
                        {/* Generic Game Icon or Placeholder Graphic */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 opacity-20 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>
                        <span className="text-xs md:text-sm font-semibold opacity-70 break-words w-full line-clamp-3">
                            {alt}
                        </span>
                    </div>
                )}

                {/* Optional: Show loading indicator if fixing */}
                {isFixing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    </div>
                )}
            </div>
        );
    }

    return (
        <Image
            src={imgSrc}
            alt={alt}
            className={className}
            onError={handleError}
            {...props}
        />
    );
}


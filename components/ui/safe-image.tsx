"use client";

import React, { useState, useEffect } from 'react';
import Image, { ImageProps } from 'next/image';
import { reportBrokenImage } from '@/actions/images';
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
    const [hasError, setHasError] = useState(false);
    const [reportSent, setReportSent] = useState(false);

    // Reset error state if src changes
    useEffect(() => {
        setHasError(false);
        setReportSent(false);
    }, [src]);

    const handleError = () => {
        console.warn(`[SafeImage] Failed to load image: ${src}`);
        setHasError(true);

        if (gameId && !reportSent) {
            // Avoid spamming the server
            setReportSent(true);

            // Fire and forget report
            reportBrokenImage(gameId, imageType).catch(err =>
                console.error("Failed to report broken image", err)
            );
        }
    };

    if (!src || hasError) {
        return (
            <div className={cn("flex h-full w-full items-center justify-center bg-muted", containerClassName)}>
                {fallback || (
                    <span className="text-xs text-muted-foreground text-center p-2">
                        {alt}
                    </span>
                )}
            </div>
        );
    }

    return (
        <Image
            src={src}
            alt={alt}
            className={className}
            onError={handleError}
            {...props}
        />
    );
}

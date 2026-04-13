import Image, { type ImageProps } from 'next/image';

/**
 * TMDB CDN URL의 사이즈 세그먼트를 교체한다.
 * 예: 'https://image.tmdb.org/t/p/w500/xxx.jpg' -> 'https://image.tmdb.org/t/p/w342/xxx.jpg'
 */
export function replaceTmdbSize(url: string, targetSize: string): string {
  return url.replace(
    /https:\/\/image\.tmdb\.org\/t\/p\/[^/]+/,
    `https://image.tmdb.org/t/p/${targetSize}`,
  );
}

/**
 * TMDB 이미지 전용 래퍼 컴포넌트.
 * next/image에 unoptimized={true}를 자동 적용하여 Next.js 최적화 프록시를 우회한다.
 * TMDB CDN이 이미 WebP + 다양한 사이즈를 제공하므로 프록시가 불필요하다.
 */
export default function TmdbImage(props: ImageProps) {
  return <Image {...props} alt={props.alt} unoptimized />;
}

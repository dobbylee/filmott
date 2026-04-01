import Image, { type ImageProps } from 'next/image';

const TMDB_HOST = 'image.tmdb.org';

/** TMDB URL의 사이즈 세그먼트를 교체한다 */
export function replaceTmdbSize(url: string, size: string): string {
  return url.replace(/\/t\/p\/[^/]+\//, `/t/p/${size}/`);
}

/** TMDB 이미지 전용 래퍼 -- unoptimized={true} 자동 적용 */
export default function TmdbImage(props: ImageProps) {
  return <Image {...props} unoptimized />;
}

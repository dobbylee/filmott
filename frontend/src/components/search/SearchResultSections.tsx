'use client';

import { useState, useCallback } from 'react';
import ContentGrid from '@/components/content/ContentGrid';
import PersonCard from '@/components/content/PersonCard';
import api from '@/lib/api';
import type { TmdbSearchItem, TmdbSearchResult } from '@/types/content';

interface SearchResultSectionsProps {
  query: string;
  searchType?: string; // undefined = 전체, 'person' = 인물
  personResults: TmdbSearchItem[];
  contentResults: TmdbSearchItem[];
  personTotal: number;
  contentTotal: number;
}

const PERSON_INITIAL = 10;
const CONTENT_INITIAL = 20;

export default function SearchResultSections({
  query,
  searchType,
  personResults: initialPersons,
  contentResults: initialContents,
  personTotal,
  contentTotal,
}: SearchResultSectionsProps) {
  const [persons, setPersons] = useState(initialPersons);
  const [contents, setContents] = useState(initialContents);
  const [personVisible, setPersonVisible] = useState(PERSON_INITIAL);
  const [contentVisible, setContentVisible] = useState(CONTENT_INITIAL);
  const [personPage, setPersonPage] = useState(1);
  const [contentPage, setContentPage] = useState(1);
  const [isLoadingPerson, setIsLoadingPerson] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const personRemaining = personTotal - personVisible;
  const contentRemaining = contentTotal - contentVisible;

  const handlePersonMore = useCallback(async () => {
    const nextVisible = personVisible + PERSON_INITIAL;

    // 이미 로드된 데이터 내에서 더 보여줄 수 있으면 확장만
    if (nextVisible <= persons.length) {
      setPersonVisible(nextVisible);
      return;
    }

    // 서버에서 다음 페이지 로드
    setIsLoadingPerson(true);
    try {
      const nextPage = personPage + 1;
      const res = await api.get<TmdbSearchResult>(
        `/contents/search?q=${encodeURIComponent(query)}&type=person&page=${nextPage}`,
      );
      setPersons((prev) => [...prev, ...res.data.results]);
      setPersonPage(nextPage);
      setPersonVisible(nextVisible);
    } catch {
      // 실패 시 로드된 데이터 내에서 최대한 보여주기
      setPersonVisible(persons.length);
    } finally {
      setIsLoadingPerson(false);
    }
  }, [personVisible, persons.length, personPage, query]);

  const handleContentMore = useCallback(async () => {
    const nextVisible = contentVisible + CONTENT_INITIAL;

    if (nextVisible <= contents.length) {
      setContentVisible(nextVisible);
      return;
    }

    setIsLoadingContent(true);
    try {
      const nextPage = contentPage + 1;
      // 전체 모드: 영화+시리즈 각각 다음 페이지 가져옴
      const [movieRes, tvRes] = await Promise.all([
        api.get<TmdbSearchResult>(
          `/contents/search?q=${encodeURIComponent(query)}&type=movie&page=${nextPage}`,
        ),
        api.get<TmdbSearchResult>(
          `/contents/search?q=${encodeURIComponent(query)}&type=tv&page=${nextPage}`,
        ),
      ]);
      const newContents = [...movieRes.data.results, ...tvRes.data.results];
      setContents((prev) => [...prev, ...newContents]);
      setContentPage(nextPage);
      setContentVisible(nextVisible);
    } catch {
      setContentVisible(contents.length);
    } finally {
      setIsLoadingContent(false);
    }
  }, [contentVisible, contents.length, contentPage, query]);

  const visiblePersons = persons.slice(0, personVisible);
  const visibleContents = contents.slice(0, contentVisible);
  const hasResults = persons.length > 0 || contents.length > 0;

  if (!hasResults) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
        <p>검색 결과가 없습니다.</p>
      </div>
    );
  }

  return (
    <>
      {visiblePersons.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-bold text-white/90">
            인물
            <span className="ml-2 text-sm font-normal text-muted-foreground">{personTotal}</span>
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {visiblePersons.map((person) => (
              <PersonCard key={`person-${person.id}`} person={person} />
            ))}
          </div>
          {personRemaining > 0 && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={handlePersonMore}
                disabled={isLoadingPerson}
                className="rounded-full border border-white/10 bg-white/5 px-8 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
              >
                {isLoadingPerson ? '불러오는 중...' : `더보기 (${personRemaining}명 남음)`}
              </button>
            </div>
          )}
        </section>
      )}

      {visibleContents.length > 0 && (
        <section>
          {persons.length > 0 && (
            <h2 className="mb-4 text-lg font-bold text-white/90">
              작품
              <span className="ml-2 text-sm font-normal text-muted-foreground">{contentTotal}</span>
            </h2>
          )}
          <ContentGrid
            items={visibleContents}
            emptyMessage="검색 결과가 없습니다."
          />
          {contentRemaining > 0 && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleContentMore}
                disabled={isLoadingContent}
                className="rounded-full border border-white/10 bg-white/5 px-8 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
              >
                {isLoadingContent ? '불러오는 중...' : `더보기 (${contentRemaining}개 남음)`}
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}

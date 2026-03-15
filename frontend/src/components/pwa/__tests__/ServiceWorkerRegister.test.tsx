import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import ServiceWorkerRegister from '../ServiceWorkerRegister';

describe('ServiceWorkerRegister', () => {
  const mockRegister = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serviceWorker를 지원하면 /sw.js를 등록한다', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: mockRegister },
      configurable: true,
      writable: true,
    });

    render(<ServiceWorkerRegister />);

    expect(mockRegister).toHaveBeenCalledWith('/sw.js');
  });

  it('serviceWorker를 지원하지 않으면 등록을 시도하지 않는다', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).serviceWorker;

    render(<ServiceWorkerRegister />);

    expect(mockRegister).not.toHaveBeenCalled();

    if (original) {
      Object.defineProperty(navigator, 'serviceWorker', original);
    }
  });

  it('아무것도 렌더링하지 않는다', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: mockRegister },
      configurable: true,
      writable: true,
    });

    const { container } = render(<ServiceWorkerRegister />);
    expect(container.innerHTML).toBe('');
  });

  it('등록 실패 시 에러를 던지지 않는다', () => {
    const mockFailRegister = vi.fn(() => Promise.reject(new Error('SW registration failed')));

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: mockFailRegister },
      configurable: true,
      writable: true,
    });

    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
  });
});

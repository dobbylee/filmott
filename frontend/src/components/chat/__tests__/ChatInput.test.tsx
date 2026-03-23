import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatInput from '@/components/chat/ChatInput';

describe('ChatInput', () => {
  it('메시지 입력 필드를 렌더링한다', () => {
    render(<ChatInput onSend={() => {}} />);
    expect(screen.getByPlaceholderText('메시지를 입력하세요.')).toBeInTheDocument();
  });

  it('전송 버튼을 렌더링한다', () => {
    render(<ChatInput onSend={() => {}} />);
    expect(screen.getByLabelText('전송')).toBeInTheDocument();
  });

  it('Enter 키를 누르면 onSend를 호출한다', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '안녕하세요' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('안녕하세요');
  });

  it('Shift+Enter는 줄바꿈이므로 onSend를 호출하지 않는다', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '안녕하세요' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('빈 메시지는 전송하지 않는다', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('전송 후 입력 필드가 비워진다', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '테스트' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(textarea.value).toBe('');
  });

  it('disabled 상태에서는 입력이 비활성화된다', () => {
    render(<ChatInput onSend={() => {}} disabled />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    expect(textarea).toBeDisabled();
  });

  it('전송 버튼 클릭으로도 메시지를 전송할 수 있다', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요.');
    fireEvent.change(textarea, { target: { value: '테스트 메시지' } });
    fireEvent.click(screen.getByLabelText('전송'));

    expect(onSend).toHaveBeenCalledWith('테스트 메시지');
  });
});

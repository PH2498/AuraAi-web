import { describe, expect, it, vi } from 'vitest';
import { createWebPlatform, PlatformCapabilityError, type PlatformHost } from './index';

describe('createWebPlatform', () => {
  it('does not request media until a method is called', async () => {
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [] }) as MediaStream);
    const platform = createWebPlatform(
      host({
        navigator: { mediaDevices: { getUserMedia } },
      }),
    );

    expect(platform.kind).toBe('web');
    expect(getUserMedia).not.toHaveBeenCalled();
    await platform.requestMicrophone();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(getUserMedia.mock.calls[0]?.[0]).toEqual({ audio: true, video: false });
  });

  it('reports a missing camera instead of requesting permission', async () => {
    const platform = createWebPlatform(host());
    await expect(platform.requestCamera()).rejects.toBeInstanceOf(PlatformCapabilityError);
    await expect(platform.requestCamera()).rejects.toMatchObject({
      code: 'MEDIA_UNSUPPORTED',
    });
  });

  it('keeps the current page focused when a screen is chosen', async () => {
    const order: string[] = [];
    const setFocusBehavior = vi.fn(() => {
      order.push('focus');
    });
    class CaptureController {
      setFocusBehavior = setFocusBehavior;
    }
    const getDisplayMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          order.push('request');
          queueMicrotask(() => {
            order.push('resolve');
            resolve({ getTracks: () => [] } as unknown as MediaStream);
          });
        }),
    );
    const platform = createWebPlatform(
      host({
        navigator: { mediaDevices: { getDisplayMedia } },
        CaptureController,
      }),
    );

    await platform.requestScreenCapture();

    expect(order).toEqual(['request', 'focus', 'resolve']);
    expect(getDisplayMedia.mock.calls[0]?.[0]?.controller).toBeInstanceOf(CaptureController);
    expect(setFocusBehavior).toHaveBeenCalledWith('no-focus-change');
  });

  it('maps a denied screen share to a permission error', async () => {
    const platform = createWebPlatform(
      host({
        navigator: {
          mediaDevices: {
            getDisplayMedia: async () => {
              throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
            },
          },
        },
      }),
    );

    await expect(platform.requestScreenCapture()).rejects.toMatchObject({
      code: 'MEDIA_PERMISSION_DENIED',
    });
  });

  it('opens only http(s) links', async () => {
    const open = vi.fn();
    const platform = createWebPlatform(host({ open }));
    await platform.openExternal('https://example.com/docs');
    expect(open).toHaveBeenCalledWith('https://example.com/docs');
    await expect(platform.openExternal('javascript:alert(1)')).rejects.toMatchObject({
      code: 'MEDIA_UNSUPPORTED',
    });
    expect(open).toHaveBeenCalledOnce();
  });
});

function host(overrides: Partial<PlatformHost> = {}): PlatformHost {
  return {
    navigator: {},
    ...overrides,
  };
}

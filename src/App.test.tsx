import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';


const mirrorApiMocks = vi.hoisted(() => ({
  mirrorGetWidgets: vi.fn(),
  mirrorPutWidgets: vi.fn(),
  mirrorAuthProviders: vi.fn(),
  mirrorAuthStartDeviceLogin: vi.fn(),
  mirrorAuthLogout: vi.fn(),
  mirrorOAuthWebStartUrl: vi.fn(),
}));

const wardrobeApiMocks = vi.hoisted(() => ({
  listClothingItems: vi.fn(),
  createClothingWithImage: vi.fn(),
  deleteClothingItem: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
}));


vi.mock('motion/react', () => {
  const createMotionComponent = (tag: string) =>
    React.forwardRef(
      (
        { children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode },
        ref,
      ) => {
        const {
          animate,
          exit,
          initial,
          layout,
          transition,
          whileHover,
          whileTap,
          ...domProps
        } = props as React.HTMLAttributes<HTMLElement> & Record<string, unknown>;
        void animate;
        void exit;
        void initial;
        void layout;
        void transition;
        void whileHover;
        void whileTap;
        return React.createElement(tag, { ...domProps, ref }, children);
      },
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: createMotionComponent('div'),
      span: createMotionComponent('span'),
      button: createMotionComponent('button'),
    },
  };
});

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: toastMocks,
}));

vi.mock('./lib/connectionManager', () => ({
  MirrorConnectionManager: class {
    connect() {}

    dispose() {}

    send() {
      return true;
    }

    getSessionId() {
      return 'session-1';
    }
  },
}));

vi.mock('./lib/connectionConfig', () => ({
  getMirrorApiToken: () => 'test-token',
  getMirrorHttpBase: () => 'http://mirror.test',
  getMirrorWsUrl: () => 'ws://mirror.test/ws/control',
  setMirrorApiToken: vi.fn(),
  setMirrorHttpBase: vi.fn(),
  setMirrorWsUrl: vi.fn(),
}));

vi.mock('./components/ui/fluid-dropdown', () => ({
  FluidDropdown: ({
    items,
    value,
    onChange,
  }: {
    items: Array<{ id: string; label: string }>;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <select aria-label="dropdown" value={value} onChange={(event) => onChange(event.target.value)}>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('./features/wardrobe/useWardrobeActions', () => ({
  useWardrobeActions: () => ({
    notifyWardrobeUpdated: vi.fn(),
  }),
}));

vi.mock('./lib/mirrorApi', () => mirrorApiMocks);

vi.mock('./features/wardrobe/clothingApi', () => ({
  CLOTHING_CATEGORIES: ['shirt', 'pants', 'accessories', 'other'],
  listClothingItems: wardrobeApiMocks.listClothingItems,
  createClothingWithImage: wardrobeApiMocks.createClothingWithImage,
  deleteClothingItem: wardrobeApiMocks.deleteClothingItem,
  primaryImageUrl: (item: { images?: Array<{ image_url: string }> | null }) =>
    item.images?.[0]?.image_url ?? null,
}));

import App from './App';


beforeEach(() => {
  mirrorApiMocks.mirrorGetWidgets.mockResolvedValue([]);
  mirrorApiMocks.mirrorPutWidgets.mockResolvedValue([]);
  mirrorApiMocks.mirrorAuthProviders.mockResolvedValue([]);
  mirrorApiMocks.mirrorAuthStartDeviceLogin.mockResolvedValue(undefined);
  mirrorApiMocks.mirrorAuthLogout.mockResolvedValue(undefined);
  mirrorApiMocks.mirrorOAuthWebStartUrl.mockReturnValue('http://mirror.test/oauth/start');

  wardrobeApiMocks.listClothingItems.mockResolvedValue([]);
  wardrobeApiMocks.createClothingWithImage.mockReset();
  wardrobeApiMocks.deleteClothingItem.mockResolvedValue(undefined);

  toastMocks.success.mockReset();
  toastMocks.error.mockReset();
  toastMocks.message.mockReset();
});


describe('App', () => {
  it('renders only the layout workspace by default', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Mirror Screen' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wardrobe' })).not.toBeInTheDocument();
    expect(screen.queryByText(/No wardrobe items yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connection Diagnostics' })).not.toBeInTheDocument();
  });

  it('renders existing wardrobe items from the mocked API', async () => {
    wardrobeApiMocks.listClothingItems.mockResolvedValue([
      {
        id: 7,
        name: 'Blue Shirt',
        category: 'shirt',
        created_at: '2026-04-26T12:00:00Z',
        updated_at: '2026-04-26T12:00:00Z',
        images: [{ image_url: 'https://cdn.example/blue-shirt.png' }],
      },
    ]);

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Wardrobe' }));
    expect(await screen.findByAltText('Blue Shirt')).toBeInTheDocument();
    expect(screen.getByText('Blue Shirt')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mirror Screen' })).not.toBeInTheDocument();
  });

  it('keeps connection diagnostics separate from layout and wardrobe', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Connection' }));

    expect(screen.getByRole('heading', { name: 'Connection Diagnostics' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mirror Screen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wardrobe' })).not.toBeInTheDocument();
  });

  it('opens the upload modal and adds a new clothing card', async () => {
    wardrobeApiMocks.createClothingWithImage.mockResolvedValue({
      id: 11,
      name: 'linen-shirt',
      category: 'shirt',
      created_at: '2026-04-26T12:00:00Z',
      updated_at: '2026-04-26T12:00:00Z',
      images: [{ image_url: 'https://cdn.example/linen-shirt.png' }],
    });

    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole('button', { name: 'Wardrobe' }));
    await screen.findByText(/No wardrobe items yet/i);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    await user.upload(fileInput!, new File(['shirt'], 'linen-shirt.png', { type: 'image/png' }));

    expect(await screen.findByText('Clothing details')).toBeInTheDocument();
    expect(screen.getByDisplayValue('linen-shirt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(wardrobeApiMocks.createClothingWithImage).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByAltText('linen-shirt')).toBeInTheDocument();
  });

  it('opens the upload modal when an image is dropped onto the wardrobe page', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Wardrobe' }));
    await screen.findByText(/No wardrobe items yet/i);

    const dropZone = screen.getByLabelText('Wardrobe upload drop zone');
    const file = new File(['jacket'], 'canvas-jacket.jpg', { type: 'image/jpeg' });

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [file],
        types: ['Files'],
      },
    });

    expect(await screen.findByText('Clothing details')).toBeInTheDocument();
    expect(screen.getByDisplayValue('canvas-jacket')).toBeInTheDocument();
    expect(wardrobeApiMocks.createClothingWithImage).not.toHaveBeenCalled();
  });
});

import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { paintBackdrop } from '../ui/Backdrop';
import { text } from '../core/theme';
import { showAuthForm } from '../ui/authForm';
import { api, ApiError } from '../core/api';
import { session } from '../core/session';
import type { TokenResult } from '../core/types';
import { GAME_WIDTH, fitCamera } from '../core/viewport';

export class MenuScene extends Phaser.Scene {
  private status?: Phaser.GameObjects.Text;

  constructor() {
    super('Menu');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    fitCamera(this);
    paintBackdrop(this);

    this.add.text(cx, 140, 'CHOOSE YOUR RUIN', text.heading).setOrigin(0.5);

    new Button(this, cx, 280, 'PLAY AS GUEST', () => this.guest(), { width: 320 });
    new Button(this, cx, 360, 'LOGIN', () => this.authForm('LOGIN', api.login), { width: 320 });
    new Button(this, cx, 440, 'REGISTER', () => this.authForm('REGISTER', api.register), { width: 320 });

    this.status = this.add.text(cx, 540, '', text.toast).setOrigin(0.5);
  }

  private enter(result: TokenResult): void {
    session.setAuth(result);
    this.scene.start('Poison');
  }

  private async guest(): Promise<void> {
    this.status?.setText('dealing you in...');
    try {
      this.enter(await api.authGuest());
    } catch (e) {
      this.status?.setText(e instanceof ApiError ? e.message : 'connection failed');
    }
  }

  private authForm(
    title: string,
    call: (u: string, p: string) => Promise<TokenResult>,
  ): void {
    let cancelled = false;
    const teardown = showAuthForm(
      title,
      async (username, password) => {
        if (!username || !password) return 'enter a username and password';
        try {
          const result = await call(username, password);
          if (cancelled) return null; // user backed out mid-request — do not navigate
          teardown();
          this.enter(result);
          return null;
        } catch (e) {
          if (cancelled) return null; // form already dismissed — swallow
          return e instanceof ApiError
            ? (e.status === 409 ? 'username taken'
              : e.status === 401 ? 'wrong username or password'
              : e.message)
            : 'connection failed';
        }
      },
      () => { cancelled = true; }, // onCancel: mark so a late success won't navigate
    );
  }
}

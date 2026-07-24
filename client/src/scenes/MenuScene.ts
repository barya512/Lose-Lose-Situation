import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { showAuthForm } from '../ui/authForm';
import { api, ApiError } from '../core/api';
import { session } from '../core/session';
import type { TokenResult } from '../core/types';

export class MenuScene extends Phaser.Scene {
  private status?: Phaser.GameObjects.Text;

  constructor() {
    super('Menu');
  }

  create(): void {
    const cx = this.scale.width / 2;
    this.add.text(cx, 140, 'CHOOSE YOUR RUIN', {
      fontSize: '40px', color: '#ff3ea5', fontStyle: 'bold',
    }).setOrigin(0.5);

    new Button(this, cx, 280, 'PLAY AS GUEST', () => this.guest(), { width: 320 });
    new Button(this, cx, 360, 'LOGIN', () => this.authForm('LOGIN', api.login), { width: 320 });
    new Button(this, cx, 440, 'REGISTER', () => this.authForm('REGISTER', api.register), { width: 320 });

    this.status = this.add.text(cx, 540, '', { fontSize: '20px', color: '#ff6b6b' }).setOrigin(0.5);
  }

  private enter(result: TokenResult): void {
    session.setAuth(result);
    this.scene.start('Slots');
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
    const teardown = showAuthForm(title, async (username, password) => {
      if (!username || !password) return;
      try {
        const result = await call(username, password);
        teardown();
        this.enter(result);
      } catch (e) {
        const msg = e instanceof ApiError
          ? (e.status === 409 ? 'username taken'
            : e.status === 401 ? 'wrong username or password'
            : e.message)
          : 'connection failed';
        this.status?.setText(msg);
      }
    });
  }
}

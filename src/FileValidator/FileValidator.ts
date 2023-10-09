import { readFile } from 'fs/promises';
import { request, type Dispatcher } from 'undici';
import type { Config } from '../Config.js';
import { FileValidationError } from './FileValidationError.js';
import type { FileValidationResult } from './types.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.101 Safari/537.36';

export class FileValidator {
  #path;
  #config;
  #content: string | undefined;

  constructor(path: string, config: Config) {
    this.#path = path;
    this.#config = config;
  }

  async #sendRequest(tryCount = 0): Promise<Dispatcher.ResponseData> {
    const response = await request('https://validator.w3.org/nu/?out=json', {
      method: 'POST',
      body: this.#content,
      bodyTimeout: 5000,
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Content-Type': 'text/html; charset=utf-8',
      },
    });

    if (response.statusCode === 503 && tryCount <= 3) {
      return await this.#sendRequest(tryCount + 1);
    }

    return response;
  }

  async validate(): Promise<FileValidationResult> {
    try {
      this.#content = await readFile(this.#path, { encoding: 'utf8' });
      const { statusCode, body } = await this.#sendRequest();

      if (statusCode !== 200) {
        throw new Error(`Invalid status code: ${statusCode}`);
      }

      const responseBody = (await body.json()) as FileValidationResult['results'];
      const preparedMessages = responseBody.messages.filter(
        ({ message }) => !this.#config.ignoredRules.includes(message),
      );

      return {
        path: this.#path,
        results: {
          messages: preparedMessages,
        },
      };
    } catch (error) {
      throw new FileValidationError(this.#path, 'Validation failed 😭', {
        cause: error,
      });
    }
  }
}

export async function readJsonResponse<T = any>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(`Сервер вернул пустой ответ (${response.status} ${response.statusText})`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Сервер вернул не JSON (${response.status} ${response.statusText}): ${text.slice(0, 300)}`);
  }
}

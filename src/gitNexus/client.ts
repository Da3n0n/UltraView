import type { GitNexusGraph, GitNexusRepository } from './types';

export class GitNexusClient {
    constructor(private readonly port: number) {}

    private async request<T>(pathname: string, init?: RequestInit): Promise<T> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        try {
            const response = await fetch(`http://127.0.0.1:${this.port}${pathname}`, {
                ...init,
                signal: controller.signal,
                headers: {
                    Accept: 'application/json',
                    Origin: `http://127.0.0.1:${this.port}`,
                    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
                    ...(init?.headers ?? {}),
                },
            });
            const text = await response.text();
            const data = text ? JSON.parse(text) : undefined;
            if (!response.ok) {
                throw new Error(data?.error ?? data?.message ?? `GitNexus returned HTTP ${response.status}`);
            }
            return data as T;
        } finally {
            clearTimeout(timeout);
        }
    }

    health(): Promise<{ status: string }> {
        return this.request('/api/health');
    }

    info(): Promise<{ version?: string; nodeVersion?: string }> {
        return this.request('/api/info');
    }

    repositories(): Promise<GitNexusRepository[]> {
        return this.request('/api/repos');
    }

    graph(repository: string): Promise<GitNexusGraph> {
        return this.request(`/api/graph?repo=${encodeURIComponent(repository)}`);
    }

    async clusters(repository: string): Promise<unknown[]> {
        const response = await this.request<{ clusters?: unknown[] } | unknown[]>(`/api/clusters?repo=${encodeURIComponent(repository)}`);
        return Array.isArray(response) ? response : response.clusters ?? [];
    }

    async processes(repository: string): Promise<unknown[]> {
        const response = await this.request<{ processes?: unknown[] } | unknown[]>(`/api/processes?repo=${encodeURIComponent(repository)}`);
        return Array.isArray(response) ? response : response.processes ?? [];
    }

    search(repository: string, query: string): Promise<unknown> {
        return this.request(`/api/search?repo=${encodeURIComponent(repository)}`, {
            method: 'POST',
            body: JSON.stringify({ query, limit: 50, mode: 'hybrid', enrich: true }),
        });
    }

    analyze(projectPath: string, embeddings: boolean): Promise<{ jobId: string; status: string }> {
        return this.request('/api/analyze', {
            method: 'POST',
            body: JSON.stringify({ path: projectPath, embeddings }),
        });
    }

    analysis(jobId: string): Promise<Record<string, unknown>> {
        return this.request(`/api/analyze/${encodeURIComponent(jobId)}`);
    }
}

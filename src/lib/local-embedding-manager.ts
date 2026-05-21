import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers"

/**
 * Manager for local embedding models using transformers.js.
 * Handles lazy loading and caching of pipelines.
 */
class LocalEmbeddingManager {
  private pipelines: Map<string, FeatureExtractionPipeline> = new Map()
  private loading: Map<string, Promise<FeatureExtractionPipeline>> = new Map()

  async getPipeline(modelId: string): Promise<FeatureExtractionPipeline> {
    // Return cached pipeline if available
    const cached = this.pipelines.get(modelId)
    if (cached) return cached

    // Return existing loading promise if already in progress
    const existingLoading = this.loading.get(modelId)
    if (existingLoading) return existingLoading

    // Start new loading promise
    const loadPromise = pipeline("feature-extraction", modelId, {
      // Use the 'webgpu' device if available, otherwise fall back to 'wasm'/'cpu'
      // Note: transformers.js v3 handles device selection better.
      // For now we'll let it use the default (usually wasm/cpu for widest compatibility in Tauri)
      // but can be tuned for performance later.
    })

    this.loading.set(modelId, loadPromise)

    try {
      const pipe = await loadPromise
      this.pipelines.set(modelId, pipe)
      return pipe
    } finally {
      this.loading.delete(modelId)
    }
  }

  /**
   * Computes embedding for a single text string using a local model.
   */
  async computeEmbedding(text: string, modelId: string): Promise<number[] | null> {
    try {
      const extractor = await this.getPipeline(modelId)
      
      // Perform feature extraction
      // pooling: 'mean' and normalize: true are standard for BGE and MiniLM
      const output = await extractor(text, { 
        pooling: "mean", 
        normalize: true 
      })

      // Convert Tensor to number array
      return Array.from(output.data as Float32Array)
    } catch (err) {
      console.error(`[LocalEmbedding] Computation failed for model ${modelId}:`, err)
      throw err
    }
  }
}

export const localEmbeddingManager = new LocalEmbeddingManager()

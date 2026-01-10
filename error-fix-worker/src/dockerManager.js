const Docker = require('dockerode');
const config = require('./config');

class DockerManager {
  constructor() {
    this.docker = new Docker();
    this.activeContainers = new Map();
  }

  /**
   * Run Claude Code container to fix an error
   * @param {string} jobId - Unique job identifier
   * @param {object} errorData - Error data from Sentry
   * @returns {Promise<object>} Container result
   */
  async runFixContainer(jobId, errorData) {
    const containerName = `error-fix-${jobId}`;

    console.log(`[Docker] Starting container ${containerName}`);

    // Prepare error data as environment variable
    const errorDataJson = JSON.stringify(errorData);

    try {
      // Create container
      const container = await this.docker.createContainer({
        Image: config.docker.image,
        name: containerName,
        Env: [
          `ERROR_DATA=${errorDataJson}`,
          `GITHUB_TOKEN=${config.github.token}`,
          `ANTHROPIC_API_KEY=${config.anthropic.apiKey}`,
          `GITHUB_REPO=${config.github.repo}`,
          `GITHUB_BASE_BRANCH=${config.github.baseBranch}`
        ],
        HostConfig: {
          AutoRemove: false, // Keep for logs inspection
          NetworkMode: config.docker.networkMode
        },
        Tty: false,
        AttachStdout: true,
        AttachStderr: true
      });

      this.activeContainers.set(jobId, container);

      // Start container
      await container.start();
      console.log(`[Docker] Container ${containerName} started`);

      // Wait for container to finish with timeout
      const result = await this.waitForContainer(container, jobId);

      return result;

    } catch (error) {
      console.error(`[Docker] Error running container ${containerName}:`, error.message);
      throw error;
    }
  }

  /**
   * Wait for container to complete
   * @param {object} container - Docker container
   * @param {string} jobId - Job identifier
   * @returns {Promise<object>} Container result with logs and exit code
   */
  async waitForContainer(container, jobId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(async () => {
        console.log(`[Docker] Job ${jobId} timed out, stopping container`);
        try {
          await container.stop({ t: 10 });
        } catch (e) {
          // Container may already be stopped
        }
        reject(new Error('Container timeout'));
      }, config.worker.jobTimeoutMs);

      container.wait(async (err, data) => {
        clearTimeout(timeout);
        this.activeContainers.delete(jobId);

        if (err) {
          reject(err);
          return;
        }

        // Get container logs
        const logs = await this.getContainerLogs(container);

        // Clean up container
        try {
          await container.remove();
          console.log(`[Docker] Container removed for job ${jobId}`);
        } catch (e) {
          console.error(`[Docker] Error removing container:`, e.message);
        }

        resolve({
          exitCode: data.StatusCode,
          logs: logs,
          success: data.StatusCode === 0
        });
      });
    });
  }

  /**
   * Get logs from container
   * @param {object} container - Docker container
   * @returns {Promise<string>} Container logs
   */
  async getContainerLogs(container) {
    try {
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        follow: false
      });

      // Docker logs come as a Buffer with header bytes
      return logs.toString('utf8');
    } catch (error) {
      console.error('[Docker] Error getting logs:', error.message);
      return '';
    }
  }

  /**
   * Get count of active containers
   * @returns {number} Number of active containers
   */
  getActiveCount() {
    return this.activeContainers.size;
  }

  /**
   * Stop all active containers (for graceful shutdown)
   */
  async stopAll() {
    console.log(`[Docker] Stopping ${this.activeContainers.size} active containers`);

    for (const [jobId, container] of this.activeContainers) {
      try {
        await container.stop({ t: 10 });
        await container.remove();
        console.log(`[Docker] Stopped container for job ${jobId}`);
      } catch (error) {
        console.error(`[Docker] Error stopping container ${jobId}:`, error.message);
      }
    }

    this.activeContainers.clear();
  }
}

module.exports = DockerManager;

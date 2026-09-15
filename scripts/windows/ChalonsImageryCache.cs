// Windows GUI-subsystem launcher: neither it nor Node allocates a console.
// Build with build-imagery-launcher.ps1. No service account or runtime install.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

internal static class ChalonsImageryCache
{
    static string logFile;
    static readonly int pid = Process.GetCurrentProcess().Id;
    static readonly string run = DateTime.UtcNow.ToString("yyyyMMddTHHmmssfffZ") + "-" + pid;
    static readonly JavaScriptSerializer json = new JavaScriptSerializer();

    static void Log(string level, string name, params object[] details)
    {
        var entry = new Dictionary<string, object> {
            {"time", DateTime.UtcNow.ToString("o")}, {"level", level},
            {"event", name}, {"pid", pid}, {"run", run}
        };
        for (int i = 0; i < details.Length; i += 2) entry[(string)details[i]] = details[i + 1];
        byte[] bytes = new UTF8Encoding(false).GetBytes(json.Serialize(entry) + Environment.NewLine);
        using (var file = new FileStream(logFile, FileMode.Append, FileAccess.Write, FileShare.ReadWrite)) {
            file.Write(bytes, 0, bytes.Length);
            file.Flush(true);
        }
    }

    [STAThread]
    static int Main(string[] args)
    {
        try {
            if (args.Length != 3) throw new ArgumentException("Expected project directory, Node executable and log directory.");
            string root = Path.GetFullPath(args[0]);
            string node = Path.GetFullPath(args[1]);
            string logs = Path.GetFullPath(args[2]);
            Directory.CreateDirectory(logs);
            logFile = Path.Combine(logs, "supervisor.jsonl");
            Log("info", "supervisor_starting", "launcher", "native-no-console");
            string script = Path.Combine(root, "scripts", "serve-imagery.mjs");
            if (!File.Exists(node) || !File.Exists(script)) throw new FileNotFoundException("Node or imagery server script is missing.");
            string stdout = Path.Combine(logs, run + ".stdout.log");
            string stderr = Path.Combine(logs, run + ".stderr.log");
            var start = new ProcessStartInfo(node, "\"" + script + "\"") {
                WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true
            };
            start.EnvironmentVariables["IGN_LOG_DIR"] = logs;
            Log("info", "process_starting", "executable", node, "stdout", stdout, "stderr", stderr);
            using (var output = new FileStream(stdout, FileMode.CreateNew, FileAccess.Write, FileShare.ReadWrite))
            using (var errors = new FileStream(stderr, FileMode.CreateNew, FileAccess.Write, FileShare.ReadWrite))
            using (var job = new ChildJob())
            using (var child = new Process { StartInfo = start }) {
                child.Start();
                try { job.Add(child); }
                catch { if (!child.HasExited) child.Kill(); throw; }
                child.StandardInput.Close();
                Task copyOutput = child.StandardOutput.BaseStream.CopyToAsync(output);
                Task copyErrors = child.StandardError.BaseStream.CopyToAsync(errors);
                Log("info", "process_started", "childPid", child.Id, "noConsole", true);
                child.WaitForExit();
                Task.WaitAll(copyOutput, copyErrors);
                output.Flush(true); errors.Flush(true);
                int code = child.ExitCode;
                Log(code == 0 ? "info" : "error", "process_exited", "childPid", child.Id, "exitCode", code, "stderr", stderr);
                return code;
            }
        } catch (Exception error) {
            try { Log("error", "supervisor_failed", "error", error.ToString()); }
            catch {
                // A failure before the normal journal opens still leaves a trace.
                try { File.AppendAllText(Path.Combine(Path.GetTempPath(), "ChalonsImageryCache-launcher-error.log"), DateTime.UtcNow.ToString("o") + " " + error + Environment.NewLine); }
                catch { }
            }
            return 1;
        }
    }

    // Terminating the scheduled launcher must also stop its child, so a later
    // launch cannot leave an unsupervised server occupying the port.
    sealed class ChildJob : IDisposable
    {
        IntPtr handle;
        public ChildJob()
        {
            handle = CreateJobObject(IntPtr.Zero, null);
            if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
            var limits = new ExtendedLimits();
            limits.Basic.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if (!SetInformationJobObject(handle, 9, ref limits, (uint)Marshal.SizeOf(limits))) {
                int error = Marshal.GetLastWin32Error(); Dispose(); throw new Win32Exception(error);
            }
        }
        public void Add(Process child)
        {
            if (!AssignProcessToJobObject(handle, child.Handle)) throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        public void Dispose() { if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; } }
        [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
            public long ProcessTime, JobTime;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass, SchedulingClass;
        }
        [StructLayout(LayoutKind.Sequential)] struct IoCounters {
            public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
        }
        [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
            public BasicLimits Basic;
            public IoCounters Io;
            public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits info, uint size);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    }
}

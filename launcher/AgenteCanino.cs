using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("Agente Canino")]
[assembly: AssemblyDescription("Panel de alojamiento para WO Definitive Edition")]
[assembly: AssemblyVersion("1.1.0.0")]

internal sealed class CommandResult {
    public int Code;
    public string Output;
}

internal static class Runner {
    public static string Redact(string root, string value) {
        try {
            string path = Path.Combine(root, ".env");
            if (File.Exists(path)) foreach (string line in File.ReadAllLines(path)) {
                int equals = line.IndexOf('=');
                if (equals < 1) continue;
                string name = line.Substring(0, equals).Trim();
                if (!(name.Contains("TOKEN") || name.Contains("API_KEY") || name.Contains("PASSWORD") || name.Contains("SECRET"))) continue;
                string secret = line.Substring(equals + 1).Trim().Trim('"', '\'');
                if (secret.Length >= 8) value = value.Replace(secret, "[OCULTO]");
            }
        } catch { }
        return value;
    }

    public static CommandResult Run(string root, string script, string arguments, string input) {
        var start = new ProcessStartInfo {
            FileName = Path.Combine(Environment.SystemDirectory, @"WindowsPowerShell\v1.0\powershell.exe"),
            Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + Path.Combine(root, "scripts", script) + "\" " + arguments,
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };
        using (var process = Process.Start(start)) {
            var output = new StringBuilder(); var error = new StringBuilder();
            object gate = new object();
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) lock (gate) output.AppendLine(e.Data); };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) lock (gate) error.AppendLine(e.Data); };
            process.BeginOutputReadLine(); process.BeginErrorReadLine();
            using (var writer = new StreamWriter(process.StandardInput.BaseStream, new UTF8Encoding(false))) {
                if (input != null) writer.Write(input);
            }
            // A background Node process can inherit unused pipe handles. Wait
            // for PowerShell itself, rather than waiting forever for pipe EOF.
            process.WaitForExit(Int32.MaxValue);
            Thread.Sleep(150);
            process.CancelOutputRead(); process.CancelErrorRead();
            lock (gate) return new CommandResult { Code = process.ExitCode, Output = Redact(root, output.ToString() + error.ToString()) };
        }
    }
}

internal sealed class PasswordDialog : Form {
    private readonly TextBox first = new TextBox();
    private readonly TextBox second = new TextBox();
    private readonly bool confirm;
    public string Password { get { return first.Text; } }

    public PasswordDialog(bool repeat) {
        confirm = repeat;
        Text = repeat ? "Proteger el relevo" : "Abrir el relevo";
        ClientSize = new Size(420, repeat ? 240 : 185);
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; MinimizeBox = false; ShowInTaskbar = false;
        Font = new Font("Segoe UI", 10);
        Controls.Add(new Label { Text = repeat ? "Elegí una contraseña de al menos 12 caracteres." : "Ingresá la contraseña que te pasó tu amigo.", AutoSize = true, Location = new Point(18, 18) });
        first.SetBounds(18, 51, 384, 28); first.UseSystemPasswordChar = true; first.MaxLength = 1024; Controls.Add(first);
        if (repeat) {
            Controls.Add(new Label { Text = "Repetí la contraseña", AutoSize = true, Location = new Point(18, 91) });
            second.SetBounds(18, 116, 384, 28); second.UseSystemPasswordChar = true; second.MaxLength = 1024; Controls.Add(second);
        }
        int bottom = repeat ? 180 : 123;
        var cancel = new Button { Text = "Cancelar", DialogResult = DialogResult.Cancel, Location = new Point(190, bottom), Size = new Size(100, 36) };
        var accept = new Button { Text = "Continuar", Location = new Point(300, bottom), Size = new Size(102, 36) };
        accept.Click += delegate {
            if (first.Text.Length < 12) { MessageBox.Show(this, "La contraseña necesita al menos 12 caracteres."); return; }
            if (confirm && first.Text != second.Text) { MessageBox.Show(this, "Las contraseñas no coinciden."); return; }
            DialogResult = DialogResult.OK;
        };
        Controls.Add(cancel); Controls.Add(accept); AcceptButton = accept; CancelButton = cancel;
    }
}

internal sealed class MainForm : Form {
    private readonly string root;
    private readonly Label status = new Label();
    private readonly Label explanation = new Label();
    private readonly TextBox details = new TextBox();
    private readonly ProgressBar progress = new ProgressBar();
    private readonly List<Button> actions = new List<Button>();
    private bool busy;
    private readonly bool autoStart;
    private static readonly Color Pink = Color.FromArgb(255, 66, 113);
    private static readonly Color Muted = Color.FromArgb(169, 177, 194);

    public MainForm(string directory, bool startOnOpen) {
        root = directory; autoStart = startOnOpen;
        Text = "Agente Canino · WO"; ClientSize = new Size(760, 570);
        MinimumSize = new Size(776, 609); MaximumSize = MinimumSize;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10); BackColor = Color.FromArgb(17, 20, 28); ForeColor = Color.WhiteSmoke;
        AutoScaleMode = AutoScaleMode.None; Icon = SystemIcons.Shield;
        Controls.Add(new Label { Text = "AGENTE CANINO", Font = new Font("Segoe UI", 24, FontStyle.Bold), Location = new Point(28, 24), Size = new Size(650, 46) });
        Controls.Add(new Label { Text = "WO DEFINITIVE EDITION  /  Tu comunidad, conectada", ForeColor = Muted, Location = new Point(30, 77), Size = new Size(700, 26) });
        var card = new Panel { BackColor = Color.FromArgb(28, 33, 45), Location = new Point(30, 122), Size = new Size(700, 109) };
        status.Text = "Listo para alojar el bot"; status.Font = new Font("Segoe UI", 15, FontStyle.Bold); status.ForeColor = Pink; status.SetBounds(18, 15, 664, 34);
        explanation.Text = "Abrí esta app para iniciar. Para cambiar de PC, usá un relevo."; explanation.ForeColor = Muted; explanation.SetBounds(18, 57, 664, 42);
        card.Controls.Add(status); card.Controls.Add(explanation); Controls.Add(card);
        AddButton("Iniciar bot", 30, 255, 340, Pink, async delegate { await StartBot(false); });
        AddButton("Detener en esta PC", 390, 255, 340, Color.FromArgb(47, 54, 71), async delegate { await StopBot(); });
        AddButton("Pasar a un amigo", 30, 314, 340, Color.FromArgb(47, 54, 71), async delegate { await Export(); });
        AddButton("Recibir y comenzar", 390, 314, 340, Color.FromArgb(47, 54, 71), async delegate { await Import(); });
        AddButton("Preparar esta PC", 30, 376, 220, Color.FromArgb(32, 38, 51), async delegate { await Prepare(); });
        AddButton("Comprobar", 270, 376, 220, Color.FromArgb(32, 38, 51), async delegate { await Diagnose(); });
        AddButton("Ver actividad", 510, 376, 220, Color.FromArgb(32, 38, 51), delegate { details.Visible = !details.Visible; });
        progress.SetBounds(30, 435, 700, 5); progress.Style = ProgressBarStyle.Marquee; progress.Visible = false; Controls.Add(progress);
        details.SetBounds(30, 453, 700, 67); details.Multiline = true; details.ReadOnly = true; details.ScrollBars = ScrollBars.Vertical;
        details.BackColor = Color.FromArgb(24, 28, 38); details.ForeColor = Muted; details.BorderStyle = BorderStyle.FixedSingle; details.Visible = false; Controls.Add(details);
        Controls.Add(new Label { Text = "Solo una PC a la vez. Podés cerrar esta ventana: el bot sigue funcionando.", ForeColor = Muted, Location = new Point(30, 534), Size = new Size(700, 24) });
        Shown += async delegate {
            if (File.Exists(Marker)) SetState("Relevo preparado · esta PC en pausa", "Recibí el relevo actualizado antes de volver a alojarlo.", false);
            else if (autoStart && HasData) await StartBot(true);
            else SetState("Primera vez en esta PC", "Elegí Recibir y comenzar con el archivo que te pasa el anfitrión actual.", false);
        };
        FormClosing += delegate(object sender, FormClosingEventArgs e) {
            if (busy) { e.Cancel = true; MessageBox.Show(this, "Esperá a que termine la operación antes de cerrar."); }
        };
    }

    private string Marker { get { return Path.Combine(root, "data", "host-handoff.json"); } }
    private bool HasData { get { return File.Exists(Path.Combine(root, ".env")) && File.Exists(Path.Combine(root, "data", "guardian.sqlite")); } }
    private void AddButton(string text, int x, int y, int width, Color color, EventHandler click) {
        var button = new Button { Text = text, Location = new Point(x, y), Size = new Size(width, 44), FlatStyle = FlatStyle.Flat, BackColor = color, ForeColor = Color.White, Cursor = Cursors.Hand, Font = new Font("Segoe UI", 11, FontStyle.Bold) };
        button.FlatAppearance.BorderSize = 0; button.Click += click; actions.Add(button); Controls.Add(button);
    }
    private void SetState(string title, string description, bool connected) {
        status.Text = title; explanation.Text = description; status.ForeColor = connected ? Color.FromArgb(91, 220, 161) : Pink;
    }
    private void SetBusy(bool value) {
        busy = value; progress.Visible = value;
        foreach (Button button in actions) button.Enabled = !value;
        UseWaitCursor = value;
    }
    private async Task<CommandResult> Command(string script, string args, string input) {
        var result = await Task.Run(delegate { return Runner.Run(root, script, args, input); });
        details.AppendText(result.Output + Environment.NewLine);
        if (details.TextLength > 24000) details.Text = details.Text.Substring(details.TextLength - 18000);
        details.SelectionStart = details.TextLength; details.ScrollToCaret();
        return result;
    }
    private async Task<bool> PrepareCore(bool runtimeOnly) {
        SetState("Preparando esta PC…", "La primera vez puede tardar unos minutos. Necesita Internet.", false);
        var result = await Command("prepare-pc.ps1", runtimeOnly ? "-OnlyRuntime" : "", null);
        return result.Code == 0;
    }
    private void Failure(string text) {
        SetState("No se completó la operación", text + " Revisá la actividad.", false); details.Visible = true;
    }
    private async Task<bool> StartCore() {
        if (!await PrepareCore(false)) { Failure("No se pudo preparar esta PC."); return false; }
        SetState("Conectando a Discord…", "Podés esperar acá; no necesitás abrir ninguna consola.", false);
        var result = await Command("launcher-action.ps1", "-Action start", null);
        if (result.Code == 0) { SetState("Bot activo en esta PC", "Podés cerrar esta ventana. Mantené la PC encendida y con Internet.", true); return true; }
        Failure("El bot no confirmó la conexión."); return false;
    }
    private async Task StartBot(bool automatic) {
        if (busy) return;
        if (!HasData) { SetState("Falta recibir el bot del equipo", "Usá Recibir y comenzar. El código de GitHub no incluye los datos del servidor.", false); return; }
        if (File.Exists(Marker)) {
            if (automatic) return;
            if (MessageBox.Show(this, "Esta PC preparó un relevo. Si tu amigo ya lo usó, recibí su copia actualizada para no perder cambios.\n\nSolo continuá si tu amigo NO llegó a usarlo y su bot está detenido. ¿Reanudar esta copia?", "Relevo pendiente", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        }
        SetBusy(true);
        try { if (await StartCore() && File.Exists(Marker)) File.Delete(Marker); }
        catch (Exception error) { details.AppendText(Runner.Redact(root, error.Message)); Failure("No se pudo iniciar el bot."); }
        finally { SetBusy(false); }
    }
    private async Task StopBot() {
        if (busy) return; SetBusy(true);
        try {
            var result = await Command("launcher-action.ps1", "-Action stop", null);
            if (result.Code == 0) SetState("Bot detenido en esta PC", "Para continuar en otra computadora, elegí Pasar a un amigo.", false);
            else Failure("No se pudo confirmar la parada.");
        } catch (Exception error) { details.AppendText(Runner.Redact(root, error.Message)); Failure("No se pudo detener."); }
        finally { SetBusy(false); }
    }
    private async Task Prepare() {
        if (busy) return; SetBusy(true);
        try { if (await PrepareCore(false)) SetState("Esta PC está preparada", "Ya podés recibir un relevo o iniciar el bot si tenés sus datos.", false); else Failure("No se pudo preparar."); }
        catch (Exception error) { details.AppendText(Runner.Redact(root, error.Message)); Failure("No se pudo preparar."); }
        finally { SetBusy(false); }
    }
    private async Task Diagnose() {
        if (busy) return; SetBusy(true); details.Visible = true;
        try {
            var result = await Command("launcher-action.ps1", "-Action doctor", null);
            if (result.Code == 0) SetState("Comprobación local completada", "Esto no comprueba si otra PC está alojando el bot.", false);
            else Failure("Faltan componentes o configuración.");
        } catch (Exception error) { details.AppendText(Runner.Redact(root, error.Message)); Failure("No se pudo comprobar."); }
        finally { SetBusy(false); }
    }
    private async Task Export() {
        if (busy) return;
        if (MessageBox.Show(this, "Esto detiene el bot en esta PC y prepara un archivo cifrado con sus datos actuales.\n\nPasáselo por privado a tu amigo y la contraseña por separado. ¿Preparar el relevo?", "Pasar a un amigo", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        using (var dialog = new PasswordDialog(true)) {
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            string input = new JavaScriptSerializer().Serialize(new { password = dialog.Password });
            SetBusy(true);
            try {
                if (!await PrepareCore(true)) { Failure("No se pudo preparar el relevo."); return; }
                SetState("Preparando el relevo…", "Deteniendo esta copia y guardando los datos actuales.", false);
                var result = await Command("launcher-action.ps1", "-Action export", input);
                if (result.Code == 0) {
                    SetState("Relevo listo · bot detenido", "El archivo está en relevos. Pasáselo a tu amigo con la contraseña por separado.", false);
                    Process.Start(new ProcessStartInfo("explorer.exe", "\"" + Path.Combine(root, "relevos") + "\"") { UseShellExecute = true });
                } else Failure("No se pudo preparar el relevo; comprobá si el bot quedó detenido.");
            } catch (Exception error) { details.AppendText(Runner.Redact(root, error.Message)); Failure("No se pudo preparar el relevo."); }
            finally { input = null; SetBusy(false); }
        }
    }
    private async Task Import() {
        if (busy) return;
        if (MessageBox.Show(this, "Usá el archivo MÁS RECIENTE del anfitrión anterior. Se guarda un respaldo antes de recibirlo.\n\n¿Tu amigo ya detuvo su bot y querés recibir e iniciar esta copia?", "Recibir y comenzar", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        using (var file = new OpenFileDialog { Filter = "Relevo WO (*.wohost)|*.wohost", Title = "Elegí el último archivo de relevo" }) {
            if (file.ShowDialog(this) != DialogResult.OK) return;
            using (var dialog = new PasswordDialog(false)) {
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                string input = new JavaScriptSerializer().Serialize(new { password = dialog.Password, file = file.FileName });
                SetBusy(true);
                try {
                    if (!await PrepareCore(true)) { Failure("No se pudo preparar esta PC."); return; }
                    SetState("Recibiendo los datos…", "Validando el relevo y conservando una copia de seguridad.", false);
                    var result = await Command("launcher-action.ps1", "-Action import", input);
                    if (result.Code == 0) await StartCore(); else Failure("No se pudo recibir el relevo.");
                } catch (Exception error) { details.AppendText(Runner.Redact(root, error.Message)); Failure("No se pudo recibir el relevo."); }
                finally { input = null; SetBusy(false); }
            }
        }
    }

    public void RenderPreview(string output) {
        // Create the child windows for a complete off-screen preview, without
        // showing a window on the desktop or starting the bot.
        ShowInTaskbar = false; StartPosition = FormStartPosition.Manual;
        Location = new Point(-32000, -32000); Opacity = 0;
        Show(); Application.DoEvents();
        using (var bitmap = new Bitmap(Width, Height)) { DrawToBitmap(bitmap, new Rectangle(0, 0, Width, Height)); bitmap.Save(output, ImageFormat.Png); }
        Hide();
    }
}

internal static class Program {
    [STAThread]
    private static int Main(string[] args) {
        string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        if (args.Length == 1 && args[0] == "--smoke-test") {
            Directory.CreateDirectory(Path.Combine(root, "data"));
            using (var form = new MainForm(root, false)) form.RenderPreview(Path.Combine(root, "data", "launcher-preview.png"));
            File.WriteAllText(Path.Combine(root, "data", "launcher-smoke.json"), "{\"ui\":true,\"autoStart\":false}"); return 0;
        }
        if (args.Length == 2 && args[0] == "--test-action" && (args[1] == "start" || args[1] == "stop" || args[1] == "doctor")) {
            CommandResult result = Runner.Run(root, "launcher-action.ps1", "-Action " + args[1], null);
            Directory.CreateDirectory(Path.Combine(root, "data"));
            File.WriteAllText(Path.Combine(root, "data", "launcher-test.json"), new JavaScriptSerializer().Serialize(new { code = result.Code, output = result.Output })); return result.Code;
        }
        if (!File.Exists(Path.Combine(root, "src", "index.js")) || !File.Exists(Path.Combine(root, "scripts", "launcher-action.ps1"))) {
            MessageBox.Show("Dejá Agente-Canino.exe dentro de la carpeta completa del bot. Si lo descargaste como ZIP, extraé todos sus archivos primero. Podés crear un acceso directo al exe en el escritorio.", "Faltan archivos del bot", MessageBoxButtons.OK, MessageBoxIcon.Information); return 1;
        }
        string id;
        using (var sha = SHA256.Create()) id = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(root.ToLowerInvariant()))).Replace("-", "").Substring(0, 24);
        bool created;
        using (var mutex = new Mutex(true, "Local\\WO-Launcher-" + id, out created)) {
            if (!created) { MessageBox.Show("El panel de Agente Canino ya está abierto para esta carpeta.", "Agente Canino"); return 0; }
            try { Application.Run(new MainForm(root, true)); }
            finally { mutex.ReleaseMutex(); }
        }
        return 0;
    }
}

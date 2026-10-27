function Initialize-BocchiShellLink {
  if ('Bocchi.Theme.ShellLinks' -as [type]) { return }
  # WScript.Shell can round-trip arguments through the process ANSI code page.
  # Use the W interface for every string, including paths used to load/save.
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

namespace Bocchi.Theme {
  public sealed class ShellLinkRecord {
    public string TargetPath { get; set; }
    public string Arguments { get; set; }
    public string WorkingDirectory { get; set; }
    public string Description { get; set; }
    public string IconPath { get; set; }
    public int IconIndex { get; set; }
    public int ShowCommand { get; set; }
    public string IconLocation { get { return IconPath + "," + IconIndex; } }
  }

  public static class ShellLinks {
    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLinkObject { }

    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellLinkW {
      void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int count, IntPtr findData, uint flags);
      void GetIDList(out IntPtr itemIdList);
      void SetIDList(IntPtr itemIdList);
      void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int count);
      void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string text);
      void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int count);
      void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string path);
      void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int count);
      void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string text);
      void GetHotkey(out short hotkey);
      void SetHotkey(short hotkey);
      void GetShowCmd(out int command);
      void SetShowCmd(int command);
      void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int count, out int index);
      void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
      void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
      void Resolve(IntPtr window, uint flags);
      void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
    }

    public static ShellLinkRecord Read(string path) {
      object instance = new ShellLinkObject();
      try {
        ((IPersistFile)instance).Load(Path.GetFullPath(path), 0);
        IShellLinkW link = (IShellLinkW)instance;
        StringBuilder target = new StringBuilder(32768);
        StringBuilder arguments = new StringBuilder(32768);
        StringBuilder directory = new StringBuilder(32768);
        StringBuilder description = new StringBuilder(32768);
        StringBuilder icon = new StringBuilder(32768);
        int iconIndex, showCommand;
        // SLGP_RAWPATH; never Resolve a link or search for its target.
        link.GetPath(target, target.Capacity, IntPtr.Zero, 4);
        link.GetArguments(arguments, arguments.Capacity);
        link.GetWorkingDirectory(directory, directory.Capacity);
        link.GetDescription(description, description.Capacity);
        link.GetIconLocation(icon, icon.Capacity, out iconIndex);
        link.GetShowCmd(out showCommand);
        return new ShellLinkRecord {
          TargetPath = target.ToString(), Arguments = arguments.ToString(),
          WorkingDirectory = directory.ToString(), Description = description.ToString(),
          IconPath = icon.ToString(), IconIndex = iconIndex, ShowCommand = showCommand
        };
      } finally { Marshal.FinalReleaseComObject(instance); }
    }

    public static void Write(string path, ShellLinkRecord value) {
      if (value == null) { throw new ArgumentNullException("value"); }
      object instance = new ShellLinkObject();
      try {
        IShellLinkW link = (IShellLinkW)instance;
        link.SetPath(value.TargetPath);
        link.SetArguments(value.Arguments ?? "");
        link.SetWorkingDirectory(value.WorkingDirectory ?? "");
        link.SetDescription(value.Description ?? "");
        if (!String.IsNullOrEmpty(value.IconPath)) { link.SetIconLocation(value.IconPath, value.IconIndex); }
        link.SetShowCmd(value.ShowCommand);
        ((IPersistFile)instance).Save(Path.GetFullPath(path), true);
      } finally { Marshal.FinalReleaseComObject(instance); }
    }
  }
}
'@
}

function Read-BocchiShellLink([string]$Path) {
  Initialize-BocchiShellLink
  return [Bocchi.Theme.ShellLinks]::Read($Path)
}

function Write-BocchiShellLink([string]$Path,[object]$Value) {
  Initialize-BocchiShellLink
  [Bocchi.Theme.ShellLinks]::Write($Path,$Value)
}


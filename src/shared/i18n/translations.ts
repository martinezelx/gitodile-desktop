export interface SharedTranslations {
  errorPathMissing: string;
  errorPathUnusable: string;
  errorNotRepository: string;
  errorBareRepository: string;
  errorInvalidCloneSource: string;
  errorInvalidCloneDestination: string;
  errorCloneDestinationExists: string;
  errorCloneDestinationCollides: string;
  errorStaleClonePlan: string;
  errorCloneOperationBusy: string;
  errorCloneOperationMissing: string;
  errorCloneVerificationFailed: string;
  errorClonePublishUncertain: string;
  errorCloneCleanupRequired: string;
  errorCloneCleanupUnavailable: string;
  errorCloneFailed: string;
  errorInvalidProjectName: string;
  errorProjectDestinationExists: string;
  errorProjectDestinationCollides: string;
  errorExistingGitMetadata: string;
  errorLinkedWorktree: string;
  errorNestedRepository: string;
  errorInitializationInspectionIncomplete: string;
  errorInvalidInitialBranch: string;
  errorReadmeAlreadyExists: string;
  errorStaleInitializePlan: string;
  errorInitializeFailed: string;
  errorInitializeVerificationFailed: string;
  errorInitializeCleanupRequired: string;
  errorInitializeCleanupUnavailable: string;
  errorOffline: string;
  errorCertificateFailed: string;
  errorHostKeyFailed: string;
  errorRemoteNotFound: string;
  errorDiskFull: string;
  errorPermissionDenied: string;
  errorPathTooLong: string;
  errorGitMissing: string;
  errorGitUnusable: string;
  errorGitCommandFailed: string;
  errorInvalidIdentity: string;
  errorGitConfigWriteFailed: string;
  errorPathInvalid: string;
  errorPathNotChanged: string;
  errorPathEncodingUnsupported: string;
  errorNothingToSave: string;
  errorUnresolvedConflicts: string;
  errorDetachedHead: string;
  errorGitOperationInProgress: string;
  errorMissingIdentity: string;
  errorEmptyTitle: string;
  errorInvalidTitle: string;
  errorStalePreview: string;
  errorStaleHistoryCursor: string;
  errorVersionLineMissing: string;
  errorHookRejected: string;
  errorSigningFailed: string;
  errorIndexUnavailable: string;
  errorIndexRestoreFailed: string;
  errorInvalidSelection: string;
  errorNoRemoteConfigured: string;
  errorRemoteSelectionRequired: string;
  errorUnbornBranchNoVersion: string;
  errorNothingToPublish: string;
  errorNothingToGet: string;
  errorBehindRemote: string;
  errorDivergedHistories: string;
  errorStalePublishPlan: string;
  errorStaleGetTeamChangesPlan: string;
  errorInvalidRefName: string;
  errorAuthenticationFailed: string;
  errorNetworkTimeout: string;
  errorOperationCancelled: string;
  errorInvalidRemoteConfiguration: string;
  errorInvalidRemoteUrl: string;
  errorRemoteNameExists: string;
  errorStaleConnectRemotePlan: string;
  errorRemoteConnectFailed: string;
  errorRemoteConnectUncertain: string;
  errorRemoteRefMissing: string;
  errorRemoteRejected: string;
  errorPublishUncertain: string;
  errorGetTeamChangesUncertain: string;
  errorGitVersionTooOld: string;
  errorVersionLineNameTaken: string;
  errorVersionLineNameCollides: string;
  errorVersionLineCheckedOutElsewhere: string;
  errorVersionLineIsActive: string;
  errorVersionLineIsDefault: string;
  errorVersionLineUniqueWork: string;
  errorVersionLineSwitchObstructed: string;
  errorStaleVersionLinePlan: string;
  errorDirtyWorkingTree: string;
  errorIncomingTrackedChangeCollision: string;
  errorIncomingPathCollision: string;
  errorRefLocked: string;
  errorNothingToDiscard: string;
  errorStaleDiscardPlan: string;
  errorRecoveryUnavailable: string;
  errorRecoveryConflict: string;
  errorRecoveryFailed: string;
  errorIgnoreFileTooLarge: string;
  errorIgnoreFileNotText: string;
  errorStaleIgnoreFile: string;
  errorIgnoreFileWriteFailed: string;
  commonSystem: string;
  commonVersion: string;
  commonClose: string;
  commonLoading: string;
  commonClearSearch: string;
  commonViewErrorTitle: string;
  commonViewErrorMessage: string;
  commonViewErrorRetry: string;
  commonViewErrorDetails: string;
  commonWindowErrorTitle: string;
  commonWindowErrorMessage: string;
  commonWindowErrorReload: string;
  commonCancel: string;
  commonRequiredField: string;
}

const en: SharedTranslations = {
  errorPathMissing: "That folder no longer exists. Choose another one.",
  errorPathUnusable: "That folder can't be read. Check its permissions or choose another one.",
  errorNotRepository: "That folder isn't a Git project. Choose a project folder.",
  errorBareRepository: "That Git repository has no working files, so GitOdile can't open it.",
  errorInvalidCloneSource: "Enter a full HTTPS, SSH, Git or file URL, or a local Git path.",
  errorInvalidCloneDestination: "Choose a valid folder and a new project name.",
  errorCloneDestinationExists: "Something already exists there. GitOdile won't replace it.",
  errorCloneDestinationCollides: "That name clashes with an existing path. Choose another name.",
  errorStaleClonePlan: "The source or destination changed. Review the clone again.",
  errorCloneOperationBusy: "This clone is already running.",
  errorCloneOperationMissing: "That clone is no longer running. Start it again if needed.",
  errorCloneVerificationFailed: "The download isn't a usable Git project, so it wasn't kept.",
  errorClonePublishUncertain: "The project may already be in place, but GitOdile couldn't confirm it. Check the folder before retrying.",
  errorCloneCleanupRequired: "The clone stopped, but its temporary folder still needs cleaning up.",
  errorCloneCleanupUnavailable: "GitOdile didn't create that temporary folder, so it won't remove it.",
  errorCloneFailed: "Git couldn't clone this project. Check the address, the destination and the technical details.",
  errorInvalidProjectName: "Use a folder name without slashes, reserved names, or trailing spaces or dots.",
  errorProjectDestinationExists: "Something already exists there. GitOdile won't replace it.",
  errorProjectDestinationCollides: "That name clashes with an existing folder that differs only in capitals.",
  errorExistingGitMetadata: "That folder already uses Git. Open it as a project instead.",
  errorLinkedWorktree: "That folder is already a linked Git workspace. Open it as a project instead.",
  errorNestedRepository: "That folder is inside another Git project, or contains one. Choose another folder.",
  errorInitializationInspectionIncomplete: "GitOdile couldn't check this folder completely. Check its size and permissions, then retry.",
  errorInvalidInitialBranch: "Enter a valid version line name, like main.",
  errorReadmeAlreadyExists: "That folder already has a README. Turn off Add a README to keep it.",
  errorStaleInitializePlan: "The folder or setup changed. Review it again.",
  errorInitializeFailed: "Git couldn't set up this project. Your files weren't touched.",
  errorInitializeVerificationFailed: "GitOdile couldn't confirm the new project setup. Check the folder before continuing.",
  errorInitializeCleanupRequired: "Setup stopped, and a leftover temporary file still needs cleaning up.",
  errorInitializeCleanupUnavailable: "GitOdile didn't create that leftover file, so it won't remove it.",
  errorOffline: "Couldn't reach the server. Check your connection, VPN, proxy and the address.",
  errorCertificateFailed: "Git couldn't verify the server's certificate. Check your proxy and system certificates.",
  errorHostKeyFailed: "SSH couldn't verify the server. Check it with your SSH tools, then retry.",
  errorRemoteNotFound: "The remote project wasn't found. Check the address and your access.",
  errorDiskFull: "Not enough disk space to finish. Free some space and retry.",
  errorPermissionDenied: "GitOdile isn't allowed to read the source or write to the destination.",
  errorPathTooLong: "A file path is too long for this system. Choose a shorter destination.",
  errorGitMissing: "Git wasn't found. Install Git, then reopen GitOdile.",
  errorGitUnusable: "Git is installed but couldn't start. Check the installation.",
  errorGitCommandFailed: "Git couldn't read this project. Check that its files are readable.",
  errorInvalidIdentity: "Enter both a name and an email.",
  errorGitConfigWriteFailed: "Git couldn't save that identity. Check your global Git settings.",
  errorPathInvalid: "That file path isn't valid. Choose the file again from the list.",
  errorPathNotChanged: "That file no longer has unsaved changes. Refresh the list.",
  errorPathEncodingUnsupported: "A file name in this project can't be read safely. Rename it, then refresh.",
  errorNothingToSave: "There's nothing to save yet.",
  errorUnresolvedConflicts: "Some files have overlapping changes. Resolve them before saving.",
  errorDetachedHead: "This project isn't on a version line. Switch to one before saving.",
  errorGitOperationInProgress: "Another Git operation is in progress here. Finish or cancel it, then retry.",
  errorMissingIdentity: "Add your name and email in Settings before saving.",
  errorEmptyTitle: "Give the version a short name.",
  errorInvalidTitle: "Keep the version name on one line.",
  errorStalePreview: "The project changed since the preview. Review it again.",
  errorStaleHistoryCursor: "History changed while loading, so it was reloaded from the newest version.",
  errorVersionLineMissing: "That version line no longer exists. History is back on the current line.",
  errorHookRejected: "A Git hook rejected this version. Check its output, then retry.",
  errorSigningFailed: "Git couldn't sign this version. Check your signing setup (GPG or SSH key).",
  errorIndexUnavailable: "Couldn't prepare the changes to save. Check disk space and permissions.",
  errorIndexRestoreFailed: "Couldn't restore the prepared changes. Your files are safe; see the technical details.",
  errorInvalidSelection: "Choose at least one file to save.",
  errorNoRemoteConfigured: "This project has no remote yet. Add one in project settings.",
  errorRemoteSelectionRequired: "This project has several remotes. Choose where to publish.",
  errorUnbornBranchNoVersion: "This version line has no saved versions yet. Save one first.",
  errorNothingToPublish: "Everything is already published.",
  errorNothingToGet: "There are no newer versions to bring in.",
  errorBehindRemote: "The remote has newer versions. Get project changes first.",
  errorDivergedHistories: "This line and the remote have both changed. Get project changes first.",
  errorStalePublishPlan: "The project or the remote changed since the preview. Try publishing again.",
  errorStaleGetTeamChangesPlan: "The project or the remote changed since the preview. Review it again.",
  errorInvalidRefName: "That version line name isn't valid in Git.",
  errorAuthenticationFailed: "Couldn't sign in to the remote. Check your Git credentials.",
  errorNetworkTimeout: "The remote took too long to answer. Check your connection and retry.",
  errorOperationCancelled: "The check was cancelled. Try again whenever you're ready.",
  errorInvalidRemoteConfiguration: "This line's remote setup is incomplete. Fix its tracking branch in Git.",
  errorInvalidRemoteUrl: "Enter a full HTTPS, SSH, Git or file address.",
  errorRemoteNameExists: "A remote with that name already exists. Nothing was changed.",
  errorStaleConnectRemotePlan: "The project, name or address changed. Review the connection again.",
  errorRemoteConnectFailed: "Git couldn't add this remote. Nothing was sent over the network.",
  errorRemoteConnectUncertain: "Git changed the remote setup, but GitOdile couldn't confirm the result. Check .git/config before retrying.",
  errorRemoteRefMissing: "The branch this line tracks no longer exists on the remote.",
  errorRemoteRejected: "The remote rejected this publish. Check its rules for this branch.",
  errorPublishUncertain: "The connection dropped while publishing. Refresh to see whether it went through.",
  errorGetTeamChangesUncertain: "Couldn't confirm the final state. Keep the recovery point and check the project before continuing.",
  errorGitVersionTooOld: "Your Git is too old to switch version lines safely. Update to Git 2.23 or newer.",
  errorVersionLineNameTaken: "A version line with that name already exists.",
  errorVersionLineNameCollides: "That name differs from an existing line only in capitals, which clashes on some systems.",
  errorVersionLineCheckedOutElsewhere: "That version line is open in another workspace.",
  errorVersionLineIsActive: "You can't delete the line you're on. Switch to another one first.",
  errorVersionLineIsDefault: "This is the project's main line, so GitOdile keeps it.",
  errorVersionLineUniqueWork: "This line has saved work that exists nowhere else yet.",
  errorVersionLineSwitchObstructed: "Unsaved changes are in the way of this switch. Save or discard them, then retry.",
  errorStaleVersionLinePlan: "The project changed since the preview. Refresh and retry.",
  errorDirtyWorkingTree: "You have unsaved changes. Save a version, or start a new line with them.",
  errorIncomingTrackedChangeCollision: "Some of your unsaved changes touch files in the update. Save or discard them, then review again.",
  errorIncomingPathCollision: "A local file would be overwritten by the update. Move it, then review again.",
  errorRefLocked: "Git couldn't update right now. Another Git program may be using this project.",
  errorNothingToDiscard: "There's nothing to discard. Refresh Changes.",
  errorStaleDiscardPlan: "The files changed since the preview. Review it again.",
  errorRecoveryUnavailable: "That copy is no longer available.",
  errorRecoveryConflict: "One of those files changed since, so GitOdile won't overwrite the newer work.",
  errorRecoveryFailed: "Couldn't create or apply the local copy. Check disk space and permissions.",
  errorIgnoreFileTooLarge: "This file is too large to edit here. Open it in a text editor.",
  errorIgnoreFileNotText: "This file isn't plain text, so GitOdile won't rewrite it.",
  errorStaleIgnoreFile: "This file changed outside GitOdile. Reopen it before saving.",
  errorIgnoreFileWriteFailed: "Couldn't save this file. Check that it and its folder are writable.",
  commonSystem: "System",
  commonVersion: "Version",
  commonClose: "Close",
  commonLoading: "Loading…",
  commonClearSearch: "Clear search",
  commonViewErrorTitle: "This view ran into a problem",
  commonViewErrorMessage: "Your project wasn't changed. Try showing this view again.",
  commonViewErrorRetry: "Try again",
  commonViewErrorDetails: "Technical details",
  commonWindowErrorTitle: "GitOdile ran into a problem",
  commonWindowErrorMessage: "Your project wasn't changed. Reload the window to carry on.",
  commonWindowErrorReload: "Reload window",
  commonCancel: "Cancel",
  commonRequiredField: "Fill in this field.",
};

const es: SharedTranslations = {
  errorPathMissing: "Esa carpeta ya no existe. Elige otra.",
  errorPathUnusable: "No se puede leer esa carpeta. Comprueba sus permisos o elige otra.",
  errorNotRepository: "Esa carpeta no es un proyecto de Git. Elige la carpeta de un proyecto.",
  errorBareRepository: "Ese repositorio de Git no tiene archivos de trabajo, así que GitOdile no puede abrirlo.",
  errorInvalidCloneSource: "Escribe una URL HTTPS, SSH, Git o file completa, o una ruta de Git local.",
  errorInvalidCloneDestination: "Elige una carpeta válida y un nombre nuevo para el proyecto.",
  errorCloneDestinationExists: "Ya existe algo ahí. GitOdile no lo reemplazará.",
  errorCloneDestinationCollides: "Ese nombre choca con una ruta existente. Elige otro nombre.",
  errorStaleClonePlan: "El origen o el destino han cambiado. Revisa la clonación de nuevo.",
  errorCloneOperationBusy: "Esta clonación ya está en curso.",
  errorCloneOperationMissing: "Esa clonación ya no está en curso. Vuelve a empezarla si hace falta.",
  errorCloneVerificationFailed: "Lo descargado no es un proyecto de Git utilizable, así que no se ha conservado.",
  errorClonePublishUncertain: "Puede que el proyecto ya esté en su sitio, pero GitOdile no pudo confirmarlo. Revisa la carpeta antes de reintentar.",
  errorCloneCleanupRequired: "La clonación se detuvo, pero aún hay que limpiar su carpeta temporal.",
  errorCloneCleanupUnavailable: "GitOdile no creó esa carpeta temporal, así que no la eliminará.",
  errorCloneFailed: "Git no pudo clonar este proyecto. Revisa la dirección, el destino y los detalles técnicos.",
  errorInvalidProjectName: "Usa un nombre de carpeta sin barras, sin nombres reservados y sin espacios ni puntos al final.",
  errorProjectDestinationExists: "Ya existe algo ahí. GitOdile no lo reemplazará.",
  errorProjectDestinationCollides: "Ese nombre choca con una carpeta existente que solo cambia en mayúsculas.",
  errorExistingGitMetadata: "Esa carpeta ya usa Git. Ábrela como proyecto.",
  errorLinkedWorktree: "Esa carpeta ya es un espacio de trabajo vinculado de Git. Ábrela como proyecto.",
  errorNestedRepository: "Esa carpeta está dentro de otro proyecto de Git o contiene uno. Elige otra carpeta.",
  errorInitializationInspectionIncomplete: "GitOdile no pudo revisar la carpeta por completo. Comprueba su tamaño y permisos y reintenta.",
  errorInvalidInitialBranch: "Escribe un nombre de línea de versión válido, como main.",
  errorReadmeAlreadyExists: "Esa carpeta ya tiene un README. Desactiva Añadir README para conservarlo.",
  errorStaleInitializePlan: "La carpeta o la configuración han cambiado. Revísalas de nuevo.",
  errorInitializeFailed: "Git no pudo preparar este proyecto. Tus archivos no se han tocado.",
  errorInitializeVerificationFailed: "GitOdile no pudo confirmar la configuración del proyecto. Revisa la carpeta antes de seguir.",
  errorInitializeCleanupRequired: "La configuración se detuvo y aún queda un archivo temporal por limpiar.",
  errorInitializeCleanupUnavailable: "GitOdile no creó ese archivo, así que no lo eliminará.",
  errorOffline: "No se pudo contactar con el servidor. Revisa la conexión, la VPN, el proxy y la dirección.",
  errorCertificateFailed: "Git no pudo verificar el certificado del servidor. Revisa el proxy y los certificados del sistema.",
  errorHostKeyFailed: "SSH no pudo verificar el servidor. Compruébalo con tus herramientas SSH y reintenta.",
  errorRemoteNotFound: "No se encontró el proyecto remoto. Revisa la dirección y tus permisos de acceso.",
  errorDiskFull: "No hay espacio suficiente en el disco. Libera espacio y reintenta.",
  errorPermissionDenied: "GitOdile no tiene permiso para leer el origen o escribir en el destino.",
  errorPathTooLong: "Una ruta es demasiado larga para este sistema. Elige un destino más corto.",
  errorGitMissing: "No se encontró Git. Instálalo y vuelve a abrir GitOdile.",
  errorGitUnusable: "Git está instalado, pero no se pudo iniciar. Revisa la instalación.",
  errorGitCommandFailed: "Git no pudo leer este proyecto. Comprueba que sus archivos se pueden leer.",
  errorInvalidIdentity: "Escribe un nombre y un correo.",
  errorGitConfigWriteFailed: "Git no pudo guardar esa identidad. Revisa tu configuración global de Git.",
  errorPathInvalid: "Esa ruta no es válida. Vuelve a elegir el archivo en la lista.",
  errorPathNotChanged: "Ese archivo ya no tiene cambios sin guardar. Actualiza la lista.",
  errorPathEncodingUnsupported: "Un nombre de archivo del proyecto no se puede leer con seguridad. Renómbralo y actualiza.",
  errorNothingToSave: "Todavía no hay nada que guardar.",
  errorUnresolvedConflicts: "Algunos archivos tienen cambios superpuestos. Resuélvelos antes de guardar.",
  errorDetachedHead: "Este proyecto no está en una línea de versión. Cambia a una antes de guardar.",
  errorGitOperationInProgress: "Hay otra operación de Git en curso. Termínala o cancélala y reintenta.",
  errorMissingIdentity: "Añade tu nombre y correo en Ajustes antes de guardar.",
  errorEmptyTitle: "Ponle un nombre corto a la versión.",
  errorInvalidTitle: "Escribe el nombre de la versión en una sola línea.",
  errorStalePreview: "El proyecto ha cambiado desde la vista previa. Revísala de nuevo.",
  errorStaleHistoryCursor: "El historial cambió mientras se cargaba, así que se ha recargado desde la versión más reciente.",
  errorVersionLineMissing: "Esa línea de versión ya no existe. El historial vuelve a la línea actual.",
  errorHookRejected: "Un hook de Git rechazó esta versión. Revisa su salida y reintenta.",
  errorSigningFailed: "Git no pudo firmar esta versión. Revisa tu configuración de firma (GPG o clave SSH).",
  errorIndexUnavailable: "No se pudieron preparar los cambios para guardar. Revisa el espacio en disco y los permisos.",
  errorIndexRestoreFailed: "No se pudieron restaurar los cambios preparados. Tus archivos están a salvo; mira los detalles técnicos.",
  errorInvalidSelection: "Elige al menos un archivo para guardar.",
  errorNoRemoteConfigured: "Este proyecto aún no tiene remoto. Añade uno en los ajustes del proyecto.",
  errorRemoteSelectionRequired: "Este proyecto tiene varios remotos. Elige dónde publicar.",
  errorUnbornBranchNoVersion: "Esta línea de versión aún no tiene versiones guardadas. Guarda una primero.",
  errorNothingToPublish: "Ya está todo publicado.",
  errorNothingToGet: "No hay versiones nuevas que traer.",
  errorBehindRemote: "El remoto tiene versiones más recientes. Trae primero los cambios del proyecto.",
  errorDivergedHistories: "Esta línea y el remoto han cambiado los dos. Trae primero los cambios del proyecto.",
  errorStalePublishPlan: "El proyecto o el remoto han cambiado desde la vista previa. Vuelve a publicar.",
  errorStaleGetTeamChangesPlan: "El proyecto o el remoto han cambiado desde la vista previa. Revísala de nuevo.",
  errorInvalidRefName: "Ese nombre de línea de versión no es válido en Git.",
  errorAuthenticationFailed: "No se pudo iniciar sesión en el remoto. Revisa tus credenciales de Git.",
  errorNetworkTimeout: "El remoto tardó demasiado en responder. Revisa la conexión y reintenta.",
  errorOperationCancelled: "Se canceló la comprobación. Reinténtalo cuando quieras.",
  errorInvalidRemoteConfiguration: "La configuración remota de esta línea está incompleta. Corrige su rama de seguimiento en Git.",
  errorInvalidRemoteUrl: "Escribe una dirección HTTPS, SSH, Git o file completa.",
  errorRemoteNameExists: "Ya existe un remoto con ese nombre. No se ha cambiado nada.",
  errorStaleConnectRemotePlan: "El proyecto, el nombre o la dirección han cambiado. Revisa la conexión de nuevo.",
  errorRemoteConnectFailed: "Git no pudo añadir este remoto. No se envió nada por la red.",
  errorRemoteConnectUncertain: "Git cambió la configuración remota, pero GitOdile no pudo confirmar el resultado. Revisa .git/config antes de reintentar.",
  errorRemoteRefMissing: "La rama que sigue esta línea ya no existe en el remoto.",
  errorRemoteRejected: "El remoto rechazó la publicación. Revisa sus reglas para esta rama.",
  errorPublishUncertain: "Se perdió la conexión al publicar. Actualiza para ver si llegó a publicarse.",
  errorGetTeamChangesUncertain: "No se pudo confirmar el estado final. Conserva el punto de recuperación y revisa el proyecto antes de seguir.",
  errorGitVersionTooOld: "Tu Git es demasiado antiguo para cambiar de línea con seguridad. Actualízalo a Git 2.23 o posterior.",
  errorVersionLineNameTaken: "Ya existe una línea de versión con ese nombre.",
  errorVersionLineNameCollides: "Ese nombre solo cambia en mayúsculas respecto a una línea existente, y eso choca en algunos sistemas.",
  errorVersionLineCheckedOutElsewhere: "Esa línea de versión está abierta en otro espacio de trabajo.",
  errorVersionLineIsActive: "No puedes eliminar la línea en la que estás. Cambia antes a otra.",
  errorVersionLineIsDefault: "Es la línea principal del proyecto, así que GitOdile la conserva.",
  errorVersionLineUniqueWork: "Esta línea tiene trabajo guardado que todavía no está en ningún otro sitio.",
  errorVersionLineSwitchObstructed: "Hay cambios sin guardar que impiden el cambio de línea. Guárdalos o descártalos y reintenta.",
  errorStaleVersionLinePlan: "El proyecto ha cambiado desde la vista previa. Actualiza y reintenta.",
  errorDirtyWorkingTree: "Tienes cambios sin guardar. Guarda una versión o empieza una línea nueva con ellos.",
  errorIncomingTrackedChangeCollision: "Algunos de tus cambios sin guardar tocan archivos de la actualización. Guárdalos o descártalos y vuelve a revisar.",
  errorIncomingPathCollision: "La actualización sobrescribiría un archivo local. Muévelo y vuelve a revisar.",
  errorRefLocked: "Git no pudo actualizar ahora mismo. Puede que otro programa de Git esté usando el proyecto.",
  errorNothingToDiscard: "No hay nada que descartar. Actualiza Cambios.",
  errorStaleDiscardPlan: "Los archivos han cambiado desde la vista previa. Revísala de nuevo.",
  errorRecoveryUnavailable: "Esa copia ya no está disponible.",
  errorRecoveryConflict: "Uno de esos archivos ha cambiado después, así que GitOdile no sobrescribirá el trabajo más nuevo.",
  errorRecoveryFailed: "No se pudo crear o aplicar la copia local. Revisa el espacio en disco y los permisos.",
  errorIgnoreFileTooLarge: "Este archivo es demasiado grande para editarlo aquí. Ábrelo en un editor de texto.",
  errorIgnoreFileNotText: "Este archivo no es texto plano, así que GitOdile no lo reescribirá.",
  errorStaleIgnoreFile: "Este archivo cambió fuera de GitOdile. Vuelve a abrirlo antes de guardar.",
  errorIgnoreFileWriteFailed: "No se pudo guardar este archivo. Comprueba que el archivo y su carpeta admiten escritura.",
  commonSystem: "Sistema",
  commonVersion: "Versión",
  commonClose: "Cerrar",
  commonLoading: "Cargando…",
  commonClearSearch: "Borrar la búsqueda",
  commonViewErrorTitle: "Esta vista ha tenido un problema",
  commonViewErrorMessage: "Tu proyecto no ha cambiado. Prueba a mostrar la vista de nuevo.",
  commonViewErrorRetry: "Reintentar",
  commonViewErrorDetails: "Detalles técnicos",
  commonWindowErrorTitle: "GitOdile ha tenido un problema",
  commonWindowErrorMessage: "Tu proyecto no ha cambiado. Recarga la ventana para seguir.",
  commonWindowErrorReload: "Recargar la ventana",
  commonCancel: "Cancelar",
  commonRequiredField: "Rellena este campo.",
};

export const sharedTranslations = { en, es } as const;

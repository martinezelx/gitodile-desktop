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
  commonCancel: string;
  commonRequiredField: string;
}

const en: SharedTranslations = {
  errorPathMissing: "That folder no longer exists. Choose another folder.",
  errorPathUnusable: "That folder can't be read. Check its permissions or choose another folder.",
  errorNotRepository: "That folder isn't inside a Git project. Choose a project folder and try again.",
  errorBareRepository: "That Git repository has no working files, so GitOdile can't open it yet.",
  errorInvalidCloneSource: "Enter a complete HTTPS, SSH, Git, file URL, or local Git path.",
  errorInvalidCloneDestination: "Choose a valid parent folder and a safe new project name.",
  errorCloneDestinationExists: "Something already exists at that destination. GitOdile will not replace it.",
  errorCloneDestinationCollides: "That destination collides with an existing path or private staging name. Choose another name.",
  errorStaleClonePlan: "The source or destination changed after the preview. Review the clone again.",
  errorCloneOperationBusy: "This clone attempt is already running.",
  errorCloneOperationMissing: "That clone attempt is no longer running. Start a new attempt if needed.",
  errorCloneVerificationFailed: "The downloaded data could not be verified as a usable Git project, so it was not published.",
  errorClonePublishUncertain: "The project may be in the destination, but GitOdile could not verify the final move. Inspect it before retrying.",
  errorCloneCleanupRequired: "The clone stopped, but its marked private staging folder still needs safe cleanup.",
  errorCloneCleanupUnavailable: "GitOdile cannot prove that it owns this staging path, so it will not remove it.",
  errorCloneFailed: "Git could not clone this project. Check the remote, destination, and technical details.",
  errorInvalidProjectName: "Choose a safe project folder name without separators, reserved names, controls, or trailing spaces and dots.",
  errorProjectDestinationExists: "Something already exists at that destination. GitOdile will not initialize or replace it.",
  errorProjectDestinationCollides: "That project name collides with an existing path when letter case or aliases are ignored.",
  errorExistingGitMetadata: "That folder already contains Git metadata. Open the existing project instead; GitOdile will not replace .git.",
  errorLinkedWorktree: "That folder is already a linked Git worktree. Open it as an existing project instead.",
  errorNestedRepository: "That folder is inside or contains another Git project. Choose a folder without nested Git histories.",
  errorInitializationInspectionIncomplete: "GitOdile could not prove this folder is safe to initialize. Check its size and permissions, then retry.",
  errorInvalidInitialBranch: "Choose a valid initial version-line name such as main.",
  errorReadmeAlreadyExists: "That folder already has a casing-equivalent README. Keep it unchanged and turn off Add a README.",
  errorStaleInitializePlan: "The folder or setup changed after the preview. Review the local setup again.",
  errorInitializeFailed: "Git could not initialize this project. Existing working files were not cleaned or replaced.",
  errorInitializeVerificationFailed: "The new Git metadata could not be verified. Inspect the folder before trying another Git operation.",
  errorInitializeCleanupRequired: "Initialization stopped with an exact owned marker or empty artifact still needing bounded cleanup.",
  errorInitializeCleanupUnavailable: "GitOdile cannot prove it owns that initialization artifact, so it will not remove it.",
  errorOffline: "The remote host could not be reached. Check your connection, VPN, proxy, and host name.",
  errorCertificateFailed: "Git could not verify the server certificate. Check the certificate, proxy, and system trust settings.",
  errorHostKeyFailed: "SSH could not verify the host key. Verify the host with your system SSH tools, then retry.",
  errorRemoteNotFound: "The remote project was not found. Check its location and your access rights.",
  errorDiskFull: "There is not enough disk space to finish cloning. Free space and retry.",
  errorPermissionDenied: "GitOdile does not have permission to read the source or write the destination.",
  errorPathTooLong: "A project path is too long for this checkout. Choose a shorter destination or adjust long-path support.",
  errorGitMissing: "Git wasn't found. Install Git, reopen GitOdile, and try again.",
  errorGitUnusable: "Git is installed but couldn't be started. Check the installation and try again.",
  errorGitCommandFailed: "Git couldn't inspect this project. Check that its files are readable.",
  errorInvalidIdentity: "Enter both a name and an email.",
  errorGitConfigWriteFailed: "Git couldn't save that identity. Check your global Git configuration.",
  errorPathInvalid: "That file path isn't valid. Choose the file again from the list.",
  errorPathNotChanged: "This file is no longer part of the unsaved changes. Refresh the list and choose a file that is still listed.",
  errorPathEncodingUnsupported:
    "This project contains a file name GitOdile can't represent safely. Rename it with a Unicode-compatible name and refresh.",
  errorNothingToSave: "There's nothing to save right now. Make some changes first.",
  errorUnresolvedConflicts: "Some files have overlapping changes that need to be resolved before you can save.",
  errorDetachedHead: "This project isn't on a version line right now. Switch to one before saving a version.",
  errorGitOperationInProgress:
    "A Git operation is already in progress in this project. Finish or abort it, then try again.",
  errorMissingIdentity: "GitOdile doesn't know who is saving this version yet. Add a name and email in Settings.",
  errorEmptyTitle: "Write a short name before saving.",
  errorInvalidTitle: "Keep the version name on one line.",
  errorStalePreview: "This project changed since the preview was shown. Review the updated changes and try again.",
  errorStaleHistoryCursor: "The saved-version timeline changed while it was loading. GitOdile refreshed it from the newest version.",
  errorVersionLineMissing: "That version line isn't in this project any more. History went back to the current line.",
  errorHookRejected: "A Git hook rejected this version. Check the hook's output, then try again.",
  errorSigningFailed: "Git couldn't sign this version. Check your commit-signing setup (GPG or SSH key) and try again.",
  errorIndexUnavailable:
    "GitOdile couldn't safely prepare this project's Git index. Check disk space and permissions, then try again.",
  errorIndexRestoreFailed:
    "GitOdile couldn't restore the project's prepared changes. Your working files are still there; review the technical details before trying again.",
  errorInvalidSelection: "Choose at least one file to save.",
  errorNoRemoteConfigured: "This project has no remote project configured yet. Add a remote in Git, then try again.",
  errorRemoteSelectionRequired: "This project has more than one remote project. Choose which one to publish to.",
  errorUnbornBranchNoVersion: "There's no saved version on this version line yet. Save a version first.",
  errorNothingToPublish: "Every saved version is already published.",
  errorNothingToGet: "This project no longer has newer project versions that can be applied as a direct update.",
  errorBehindRemote: "The remote project has newer versions this project doesn't have yet. Get the project changes first.",
  errorDivergedHistories:
    "This version line and the remote project have both moved apart. Get the project changes first.",
  errorStalePublishPlan: "This project or the remote project changed since the preview was shown. Try publishing again.",
  errorStaleGetTeamChangesPlan: "This project or its remote destination changed since the preview. Review the updated plan.",
  errorInvalidRefName: "This version line's name isn't a valid Git reference.",
  errorAuthenticationFailed: "GitOdile couldn't sign in to the remote project. Check your Git credentials and try again.",
  errorNetworkTimeout: "GitOdile couldn't reach the remote project in time. Check your connection and try again.",
  errorOperationCancelled: "The remote check was cancelled. Try again when you’re ready.",
  errorInvalidRemoteConfiguration: "This version line's remote setup is incomplete or invalid. Repair its upstream configuration in Git.",
  errorInvalidRemoteUrl: "Enter a complete HTTPS, SSH, Git, file, or SCP-like SSH remote URL.",
  errorRemoteNameExists: "A remote with that name already exists or differs only by letter case. Existing configuration was not changed.",
  errorStaleConnectRemotePlan: "The project, remote name, or URL changed after the preview. Review the remote connection again.",
  errorRemoteConnectFailed: "Git could not add this remote configuration. No network request was made.",
  errorRemoteConnectUncertain: "Git changed remote configuration, but GitOdile could not verify the exact result. Inspect .git/config before retrying.",
  errorRemoteRefMissing: "The configured remote version no longer exists on the remote project. Check the upstream setup before trying again.",
  errorRemoteRejected: "The remote project rejected this publish. Check the remote project's rules for this branch.",
  errorPublishUncertain:
    "GitOdile lost the connection while publishing. Refresh and check whether it was published before trying again.",
  errorGetTeamChangesUncertain:
    "GitOdile could not prove the final local state. Keep the recovery reference and inspect the project before another action.",
  errorGitVersionTooOld:
    "This version of Git is too old for GitOdile to change version lines safely. Update Git to version 2.23 or newer.",
  errorVersionLineNameTaken: "A version line with this exact name already exists. Choose a different name.",
  errorVersionLineNameCollides:
    "That name only differs by letter case from an existing version line, which some file systems can't tell apart. Choose a different name.",
  errorVersionLineCheckedOutElsewhere: "That version line is open in another workspace.",
  errorVersionLineIsActive: "The active version line can't be deleted. Switch to a different one first.",
  errorVersionLineIsDefault:
    "This is the project's main version line, so GitOdile keeps it as it is.",
  errorVersionLineUniqueWork:
    "This version line has saved work that isn't reachable from any other version line or remote yet.",
  errorVersionLineSwitchObstructed:
    "Git found local changes in the way of this switch that weren't visible in the preview. Save or discard them in Git directly, then try again.",
  errorStaleVersionLinePlan: "This project changed since the preview was shown. Refresh and try again.",
  errorDirtyWorkingTree:
    "This project has unsaved changes, so GitOdile can't switch version lines yet. Save a version, or start a new version line with this work.",
  errorIncomingTrackedChangeCollision:
    "Some prepared or unsaved changes overlap files in the team update. Save, move, or discard those changes yourself, then review again.",
  errorIncomingPathCollision:
    "A local untracked or ignored path could be overwritten by the team update. Move or save it yourself, then review again.",
  errorRefLocked: "Git couldn't update its references right now — another Git process may be using them.",
  errorNothingToDiscard: "There are no matching changes to discard. Refresh Changes and try again.",
  errorStaleDiscardPlan: "The changed files moved since the preview was shown. Review the updated plan.",
  errorRecoveryUnavailable: "That discard recovery is no longer available.",
  errorRecoveryConflict: "One of those files changed after this discard, so GitOdile won't overwrite the newer work.",
  errorRecoveryFailed: "GitOdile couldn't create or apply the local recovery safely. Check disk space and permissions.",
  errorIgnoreFileTooLarge: "This ignore file is too large to edit here. Open it in a text editor instead.",
  errorIgnoreFileNotText: "This ignore file isn't plain text, so GitOdile won't rewrite it.",
  errorStaleIgnoreFile: "This ignore file changed outside GitOdile. Reopen it to see the current rules before saving.",
  errorIgnoreFileWriteFailed: "GitOdile couldn't save this ignore file. Check that it and its folder are writable.",
  commonSystem: "System",
  commonVersion: "Version",
  commonClose: "Close",
  commonLoading: "Loading…",
  commonClearSearch: "Clear search",
  commonCancel: "Cancel",
  commonRequiredField: "Fill in this field.",
};

const es: SharedTranslations = {
  errorPathMissing: "Esa carpeta ya no existe. Elige otra carpeta.",
  errorPathUnusable: "No se puede leer esa carpeta. Comprueba sus permisos o elige otra.",
  errorNotRepository: "Esa carpeta no está dentro de un proyecto de Git. Elige una carpeta del proyecto.",
  errorBareRepository: "Ese repositorio no contiene archivos de trabajo, así que GitOdile aún no puede abrirlo.",
  errorInvalidCloneSource: "Introduce una URL HTTPS, SSH, Git o file completa, o una ruta Git local.",
  errorInvalidCloneDestination: "Elige una carpeta contenedora válida y un nombre nuevo seguro para el proyecto.",
  errorCloneDestinationExists: "Ya existe algo en ese destino. GitOdile no lo reemplazará.",
  errorCloneDestinationCollides: "Ese destino colisiona con una ruta existente o un nombre temporal privado. Elige otro nombre.",
  errorStaleClonePlan: "El origen o el destino cambiaron después de la vista previa. Revisa de nuevo la clonación.",
  errorCloneOperationBusy: "Este intento de clonación ya está en curso.",
  errorCloneOperationMissing: "Ese intento de clonación ya no está en curso. Inicia uno nuevo si lo necesitas.",
  errorCloneVerificationFailed: "Los datos descargados no se pudieron verificar como proyecto Git utilizable, así que no se publicaron.",
  errorClonePublishUncertain: "Puede que el proyecto esté en el destino, pero GitOdile no pudo verificar el movimiento final. Inspecciónalo antes de reintentar.",
  errorCloneCleanupRequired: "La clonación se detuvo, pero su carpeta temporal privada marcada todavía requiere una limpieza segura.",
  errorCloneCleanupUnavailable: "GitOdile no puede demostrar que esa ruta temporal sea suya, así que no la eliminará.",
  errorCloneFailed: "Git no pudo clonar este proyecto. Comprueba el remoto, el destino y los detalles técnicos.",
  errorInvalidProjectName: "Elige un nombre de carpeta seguro sin separadores, nombres reservados, controles ni espacios o puntos finales.",
  errorProjectDestinationExists: "Ya existe algo en ese destino. GitOdile no lo inicializará ni reemplazará.",
  errorProjectDestinationCollides: "Ese nombre colisiona con una ruta existente al ignorar mayúsculas, minúsculas o alias.",
  errorExistingGitMetadata: "Esa carpeta ya contiene metadatos Git. Abre el proyecto existente; GitOdile no reemplazará .git.",
  errorLinkedWorktree: "Esa carpeta ya es un worktree enlazado de Git. Ábrela como proyecto existente.",
  errorNestedRepository: "Esa carpeta está dentro de otro proyecto Git o contiene uno. Elige una carpeta sin historiales anidados.",
  errorInitializationInspectionIncomplete: "GitOdile no pudo demostrar que fuera seguro inicializar esta carpeta. Comprueba su tamaño y permisos.",
  errorInvalidInitialBranch: "Elige un nombre válido para la línea de versión inicial, como main.",
  errorReadmeAlreadyExists: "Esa carpeta ya contiene un README equivalente por mayúsculas o minúsculas. Consérvalo y desactiva Añadir README.",
  errorStaleInitializePlan: "La carpeta o configuración cambió después de la vista previa. Revísala de nuevo.",
  errorInitializeFailed: "Git no pudo inicializar este proyecto. Los archivos de trabajo existentes no se limpiaron ni reemplazaron.",
  errorInitializeVerificationFailed: "No se pudieron verificar los metadatos Git nuevos. Inspecciona la carpeta antes de otra operación Git.",
  errorInitializeCleanupRequired: "La inicialización se detuvo y aún requiere limpiar de forma acotada un marcador o artefacto vacío propio.",
  errorInitializeCleanupUnavailable: "GitOdile no puede demostrar que ese artefacto de inicialización sea suyo, así que no lo eliminará.",
  errorOffline: "No se pudo contactar con el host remoto. Comprueba la conexión, VPN, proxy y nombre del host.",
  errorCertificateFailed: "Git no pudo verificar el certificado del servidor. Comprueba el certificado, proxy y confianza del sistema.",
  errorHostKeyFailed: "SSH no pudo verificar la clave del host. Verifica el host con las herramientas SSH del sistema y reintenta.",
  errorRemoteNotFound: "No se encontró el proyecto remoto. Comprueba su ubicación y tus permisos de acceso.",
  errorDiskFull: "No hay espacio suficiente para terminar la clonación. Libera espacio y reintenta.",
  errorPermissionDenied: "GitOdile no tiene permiso para leer el origen o escribir en el destino.",
  errorPathTooLong: "Una ruta del proyecto es demasiado larga. Elige un destino más corto o ajusta el soporte de rutas largas.",
  errorGitMissing: "No se encontró Git. Instálalo, vuelve a abrir GitOdile e inténtalo de nuevo.",
  errorGitUnusable: "Git está instalado, pero no se pudo iniciar. Comprueba la instalación.",
  errorGitCommandFailed: "Git no pudo inspeccionar este proyecto. Comprueba que sus archivos se puedan leer.",
  errorInvalidIdentity: "Introduce un nombre y un correo electrónico.",
  errorGitConfigWriteFailed: "Git no pudo guardar la identidad. Comprueba tu configuración global de Git.",
  errorPathInvalid: "Esa ruta de archivo no es válida. Elige el archivo de nuevo desde la lista.",
  errorPathNotChanged:
    "Este archivo ya no forma parte de los cambios sin guardar. Actualiza la lista y elige un archivo que siga apareciendo.",
  errorPathEncodingUnsupported:
    "Este proyecto contiene un nombre de archivo que GitOdile no puede representar de forma segura. Renómbralo con un nombre Unicode compatible y actualiza.",
  errorNothingToSave: "No hay nada que guardar ahora mismo. Haz algún cambio primero.",
  errorUnresolvedConflicts: "Algunos archivos tienen cambios superpuestos que hay que resolver antes de poder guardar.",
  errorDetachedHead: "Este proyecto no está en una línea de versión ahora mismo. Cambia a una antes de guardar una versión.",
  errorGitOperationInProgress:
    "Ya hay una operación de Git en curso en este proyecto. Termínala o cancélala, y vuelve a intentarlo.",
  errorMissingIdentity: "GitOdile todavía no sabe quién está guardando esta versión. Añade un nombre y un correo en Ajustes.",
  errorEmptyTitle: "Escribe un nombre breve antes de guardar.",
  errorInvalidTitle: "Escribe el nombre de la versión en una sola línea.",
  errorStalePreview: "Este proyecto cambió desde que se mostró la vista previa. Revisa los cambios actualizados e inténtalo de nuevo.",
  errorStaleHistoryCursor: "El historial de versiones guardadas cambió mientras se cargaba. GitOdile lo actualizó desde la versión más reciente.",
  errorVersionLineMissing: "Esa línea de versión ya no está en este proyecto. El historial volvió a la línea actual.",
  errorHookRejected: "Un hook de Git rechazó esta versión. Revisa lo que indica el hook e inténtalo de nuevo.",
  errorSigningFailed: "Git no pudo firmar esta versión. Comprueba tu configuración de firma (GPG o clave SSH) e inténtalo de nuevo.",
  errorIndexUnavailable:
    "GitOdile no pudo preparar de forma segura el índice de Git de este proyecto. Comprueba el espacio en disco y los permisos, e inténtalo de nuevo.",
  errorIndexRestoreFailed:
    "GitOdile no pudo restaurar los cambios preparados del proyecto. Tus archivos siguen ahí; revisa los detalles técnicos antes de intentarlo de nuevo.",
  errorInvalidSelection: "Elige al menos un archivo para guardar.",
  errorNoRemoteConfigured: "Este proyecto todavía no tiene un proyecto remoto configurado. Añade un remoto en Git e inténtalo de nuevo.",
  errorRemoteSelectionRequired: "Este proyecto tiene más de un proyecto remoto. Elige a cuál publicar.",
  errorUnbornBranchNoVersion: "Todavía no hay ninguna versión guardada en esta línea de versión. Guarda una versión primero.",
  errorNothingToPublish: "Todas las versiones guardadas ya están publicadas.",
  errorNothingToGet: "Este proyecto ya no tiene versiones nuevas del proyecto que se puedan aplicar como actualización directa.",
  errorBehindRemote:
    "El proyecto remoto tiene versiones más recientes que este proyecto todavía no tiene. Obtén primero los cambios del proyecto.",
  errorDivergedHistories:
    "Esta línea de versión y el proyecto remoto se han separado. Obtén primero los cambios del proyecto.",
  errorStalePublishPlan:
    "Este proyecto o el proyecto remoto cambiaron desde que se mostró la vista previa. Intenta publicar de nuevo.",
  errorStaleGetTeamChangesPlan:
    "Este proyecto o su destino remoto cambiaron desde la vista previa. Revisa el plan actualizado.",
  errorInvalidRefName: "El nombre de esta línea de versión no es una referencia de Git válida.",
  errorAuthenticationFailed:
    "GitOdile no pudo iniciar sesión en el proyecto remoto. Comprueba tus credenciales de Git e inténtalo de nuevo.",
  errorNetworkTimeout: "GitOdile no pudo contactar con el proyecto remoto a tiempo. Comprueba tu conexión e inténtalo de nuevo.",
  errorOperationCancelled: "Se canceló la comprobación remota. Inténtalo de nuevo cuando quieras.",
  errorInvalidRemoteConfiguration: "La configuración remota de esta línea de versión está incompleta o no es válida. Repara su upstream en Git.",
  errorInvalidRemoteUrl: "Introduce una URL remota HTTPS, SSH, Git, file o SSH tipo SCP completa.",
  errorRemoteNameExists: "Ya existe un remoto con ese nombre o que solo cambia en mayúsculas y minúsculas. La configuración no cambió.",
  errorStaleConnectRemotePlan: "El proyecto, nombre o URL remotos cambiaron después de la vista previa. Revisa de nuevo la conexión.",
  errorRemoteConnectFailed: "Git no pudo añadir esta configuración remota. No se hizo ninguna petición de red.",
  errorRemoteConnectUncertain: "Git cambió la configuración remota, pero GitOdile no pudo verificar el resultado exacto. Inspecciona .git/config.",
  errorRemoteRefMissing: "La versión configurada del equipo ya no existe en el proyecto remoto. Revisa el upstream antes de intentarlo de nuevo.",
  errorRemoteRejected: "El proyecto remoto rechazó esta publicación. Revisa las reglas del proyecto remoto para esta rama.",
  errorPublishUncertain:
    "GitOdile perdió la conexión mientras publicaba. Actualiza y comprueba si se publicó antes de intentarlo de nuevo.",
  errorGetTeamChangesUncertain:
    "GitOdile no pudo demostrar el estado local final. Conserva la referencia de recuperación e inspecciona el proyecto antes de realizar otra acción.",
  errorGitVersionTooOld:
    "Esta versión de Git es demasiado antigua para que GitOdile cambie de línea de versión de forma segura. Actualiza Git a la versión 2.23 o posterior.",
  errorVersionLineNameTaken: "Ya existe una línea de versión con exactamente este nombre. Elige otro nombre.",
  errorVersionLineNameCollides:
    "Ese nombre solo se diferencia por mayúsculas o minúsculas de una línea de versión existente, algo que algunos sistemas de archivos no distinguen. Elige otro nombre.",
  errorVersionLineCheckedOutElsewhere: "Esa línea de versión está abierta en otro espacio de trabajo.",
  errorVersionLineIsActive: "La línea de versión activa no se puede eliminar. Cambia primero a otra distinta.",
  errorVersionLineIsDefault:
    "Es la línea de versión principal del proyecto, así que GitOdile la deja como está.",
  errorVersionLineUniqueWork:
    "Esta línea de versión tiene trabajo guardado que todavía no es accesible desde ninguna otra línea de versión ni remoto.",
  errorVersionLineSwitchObstructed:
    "Git encontró cambios locales que impiden este cambio y que no eran visibles en la vista previa. Guárdalos o descártalos directamente en Git, e inténtalo de nuevo.",
  errorStaleVersionLinePlan: "Este proyecto cambió desde que se mostró la vista previa. Actualiza e inténtalo de nuevo.",
  errorDirtyWorkingTree:
    "Este proyecto tiene cambios sin guardar, así que GitOdile no puede cambiar de línea de versión todavía. Guarda una versión, o inicia una nueva línea de versión con este trabajo.",
  errorIncomingTrackedChangeCollision:
    "Algunos cambios preparados o sin guardar se solapan con archivos de la actualización del equipo. Guarda, mueve o descarta esos cambios tú y vuelve a revisar.",
  errorIncomingPathCollision:
    "Una ruta local sin seguimiento o ignorada podría sobrescribirse con la actualización del equipo. Muévela o guárdala tú y vuelve a revisar.",
  errorRefLocked: "Git no pudo actualizar sus referencias ahora mismo (otro proceso de Git podría estar usándolas).",
  errorNothingToDiscard: "No hay cambios coincidentes que descartar. Actualiza Cambios e inténtalo de nuevo.",
  errorStaleDiscardPlan: "Los archivos cambiaron desde que se mostró la vista previa. Revisa el plan actualizado.",
  errorRecoveryUnavailable: "Esa recuperación de descarte ya no está disponible.",
  errorRecoveryConflict: "Uno de esos archivos cambió después del descarte, así que GitOdile no sobrescribirá el trabajo más nuevo.",
  errorRecoveryFailed: "GitOdile no pudo crear o aplicar la recuperación local de forma segura. Comprueba el espacio y los permisos.",
  errorIgnoreFileTooLarge: "Este archivo de exclusiones es demasiado grande para editarlo aquí. Ábrelo en un editor de texto.",
  errorIgnoreFileNotText: "Este archivo de exclusiones no es texto plano, así que GitOdile no lo reescribirá.",
  errorStaleIgnoreFile: "Este archivo de exclusiones cambió fuera de GitOdile. Vuelve a abrirlo para ver las reglas actuales antes de guardar.",
  errorIgnoreFileWriteFailed: "GitOdile no pudo guardar este archivo de exclusiones. Comprueba que el archivo y su carpeta se pueden escribir.",
  commonSystem: "Sistema",
  commonVersion: "Versión",
  commonClose: "Cerrar",
  commonLoading: "Cargando…",
  commonClearSearch: "Borrar la búsqueda",
  commonCancel: "Cancelar",
  commonRequiredField: "Rellena este campo.",
};

export const sharedTranslations = { en, es } as const;
